import { describe, it, expect } from 'vitest'
import { expandRecurrence, inferRuleFromDates, recurrenceFromPreset } from '../../src/domain/recurrence'
import type { Horizon, RecurrenceRule, ScenarioRecurrence } from '../../src/domain/types'

const horizon: Horizon = { start: '2026-06-01', end: '2026-07-31' }
const rec = (rule: RecurrenceRule): ScenarioRecurrence => ({
  id: 'r1',
  scenarioId: 's',
  name: 'X',
  amount: 100,
  rule,
  included: true,
})
const dates = (rule: RecurrenceRule, h: Horizon = horizon) =>
  expandRecurrence(rec(rule), h).map((m) => m.date)

describe('recurrencias', () => {
  it('cada viernes (weekday = 4)', () => {
    expect(dates({ startDate: '2026-06-01', weekdays: [4] })).toEqual([
      '2026-06-05',
      '2026-06-12',
      '2026-06-19',
      '2026-06-26',
      '2026-07-03',
      '2026-07-10',
      '2026-07-17',
      '2026-07-24',
      '2026-07-31',
    ])
  })

  it('cada 15 días (intervalo rodante)', () => {
    expect(dates({ startDate: '2026-06-01', every: { n: 15, unit: 'day' } })).toEqual([
      '2026-06-01',
      '2026-06-16',
      '2026-07-01',
      '2026-07-16',
      '2026-07-31',
    ])
  })

  it('cada 2 meses', () => {
    expect(
      dates(
        { startDate: '2026-06-15', every: { n: 2, unit: 'month' } },
        { start: '2026-01-01', end: '2026-12-31' },
      ),
    ).toEqual(['2026-06-15', '2026-08-15', '2026-10-15', '2026-12-15'])
  })

  it('quincena = día 15 y fin de mes', () => {
    const out = dates({ startDate: '2026-06-01', daysOfMonth: [15, 'last'] })
    expect(out).toEqual(['2026-06-15', '2026-06-30', '2026-07-15', '2026-07-31'])
  })

  it('día 15 que cae en sábado se mueve al viernes anterior', () => {
    // 15-ago-2026 es sábado → 14-ago (viernes)
    expect(
      dates(
        { startDate: '2026-08-01', daysOfMonth: [15], businessDayAdjust: 'previous' },
        { start: '2026-08-01', end: '2026-08-31' },
      ),
    ).toEqual(['2026-08-14'])
  })

  it('primer día del mes en sábado NO se pierde (se ajusta a viernes anterior)', () => {
    // 2026-08-01 es sábado → 2026-07-31 (vie). Con horizonte que empieza antes, debe incluirse.
    const out = dates(
      { startDate: '2026-08-01', daysOfMonth: [1], businessDayAdjust: 'previous' },
      { start: '2026-07-25', end: '2026-10-15' },
    )
    expect(out).toContain('2026-07-31') // agosto, ajustado
    expect(out).toContain('2026-09-01') // septiembre, sin ajuste
    expect(out).toContain('2026-10-01')
  })

  it('primer viernes del mes', () => {
    expect(dates({ startDate: '2026-06-01', nthWeekday: { nth: 1, weekday: 4 } })).toEqual([
      '2026-06-05',
      '2026-07-03',
    ])
  })

  it('propaga creditEligible a cada ocurrencia', () => {
    const r: ScenarioRecurrence = {
      ...rec({ startDate: '2026-06-01', weekdays: [4] }),
      creditEligible: true,
    }
    const occ = expandRecurrence(r, horizon)
    expect(occ.length).toBeGreaterThan(0)
    expect(occ.every((m) => m.creditEligible === true)).toBe(true)
  })
})

describe('recurrenceFromPreset', () => {
  it('semanal usa el weekday de la fecha de inicio', () => {
    // 2026-06-05 es viernes (weekday 4)
    expect(recurrenceFromPreset('weekly', '2026-06-05')?.weekdays).toEqual([4])
  })
  it('quincena = 15 y fin de mes con ajuste a día hábil', () => {
    const rule = recurrenceFromPreset('quincena', '2026-06-01')
    expect(rule?.daysOfMonth).toEqual([15, 'last'])
    expect(rule?.businessDayAdjust).toBe('previous')
  })
  it('cada 15 días = intervalo de 15 días', () => {
    expect(recurrenceFromPreset('every15', '2026-06-01')?.every).toEqual({ n: 15, unit: 'day' })
  })
  it('once no genera regla', () => {
    expect(recurrenceFromPreset('once', '2026-06-01')).toBeUndefined()
  })
})

describe('inferRuleFromDates (reparar/extender series)', () => {
  it('semanal → cada 7 días, reproduce las mismas fechas y extiende', () => {
    const dates = ['2026-06-05', '2026-06-12', '2026-06-19']
    const rule = inferRuleFromDates(dates)
    expect(rule).toEqual({ startDate: '2026-06-05', every: { n: 7, unit: 'day' } })
    const rec: ScenarioRecurrence = { id: 'r', scenarioId: 's', name: 'X', amount: 100, rule: rule!, included: true }
    const out = expandRecurrence(rec, { start: '2026-06-05', end: '2026-07-03' }).map((m) => m.date)
    expect(out).toEqual(['2026-06-05', '2026-06-12', '2026-06-19', '2026-06-26', '2026-07-03'])
  })

  it('quincenal → cada 14 días', () => {
    expect(inferRuleFromDates(['2026-06-01', '2026-06-15', '2026-06-29'])).toEqual({
      startDate: '2026-06-01',
      every: { n: 14, unit: 'day' },
    })
  })

  it('mensual (mismo día del mes) → daysOfMonth', () => {
    expect(inferRuleFromDates(['2026-06-10', '2026-07-10', '2026-08-10'])).toEqual({
      startDate: '2026-06-10',
      daysOfMonth: [10],
    })
  })

  it('sin patrón claro → null', () => {
    expect(inferRuleFromDates(['2026-06-01', '2026-06-08', '2026-06-30'])).toBeNull()
    expect(inferRuleFromDates(['2026-06-01'])).toBeNull()
  })
})
