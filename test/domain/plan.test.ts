import { describe, it, expect } from 'vitest'
import { buildComputedScenario } from '../../src/domain/plan'
import { toCents } from '../../src/domain/money'
import { seedScenarioInput } from '../../src/data/seed/seedData'

const computed = buildComputedScenario(seedScenarioInput())
const closing = (ws: string) => computed.weeks.find((w) => w.key.weekStart === ws)?.closingBalance

describe('compuerta de aceptación — datos reales del Excel', () => {
  it('los cierres semanales coinciden exactamente', () => {
    expect(closing('2026-05-25')).toBe(toCents(37575))
    expect(closing('2026-06-01')).toBe(toCents(20275))
    expect(closing('2026-06-08')).toBe(toCents(12000.96))
  })

  it('el primer punto es un anchor de 20,375', () => {
    expect(computed.points[0].isAnchor).toBe(true)
    expect(computed.points[0].balanceAfter).toBe(toCents(20375))
  })

  it('agrupa en 6 semanas con etiquetas correctas', () => {
    expect(computed.weeks.length).toBe(6)
    expect(computed.weeks[0].key.label).toBe('25 al 31 mayo')
    expect(computed.weeks[5].key.label).toBe('29 junio al 5 julio')
  })

  it('saldo final, mínimo y nunca en rojo', () => {
    expect(computed.finalBalance).toBe(toCents(19750.96))
    expect(computed.minBalance).toBe(toCents(5876.3)) // tras pagar Credito BBVA
    expect(computed.firstNegativeWeek).toBeUndefined()
  })
})
