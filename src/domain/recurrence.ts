// Expansión de reglas de recurrencia → movimientos con fecha calculada.
import type { Horizon, ISODate, Movement, RecurrenceRule, ScenarioRecurrence, Weekday } from './types'
import {
  addDays,
  addMonths,
  adjustToBusinessDay,
  compareISO,
  lastDayOfMonth,
  parseISO,
  toISO,
  weekdayMon,
} from './dates'

const MAX = 1000 // tope de seguridad

const minISO = (a: string, b: string) => (compareISO(a, b) <= 0 ? a : b)

/** Devuelve las fechas (ISO) de una regla dentro del horizonte, ya ajustadas y deduplicadas. */
export function ruleOccurrences(rule: RecurrenceRule, horizon: Horizon): string[] {
  const genEnd = minISO(rule.endDate ?? horizon.end, horizon.end)
  const start = rule.startDate
  const nominal: string[] = []

  if (rule.every) {
    const { n, unit } = rule.every
    let cur = start
    let guard = 0
    while (compareISO(cur, genEnd) <= 0 && guard++ < MAX) {
      nominal.push(cur)
      cur = unit === 'day' ? addDays(cur, n) : unit === 'week' ? addDays(cur, 7 * n) : addMonths(cur, n)
    }
  } else if (rule.weekdays && rule.weekdays.length) {
    const set = new Set<Weekday>(rule.weekdays)
    let weekMon = addDays(start, -weekdayMon(start)) // lunes de la semana de `start`
    let guard = 0
    while (compareISO(weekMon, genEnd) <= 0 && guard++ < MAX) {
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekMon, i)
        if (set.has(i as Weekday) && compareISO(d, start) >= 0 && compareISO(d, genEnd) <= 0) {
          nominal.push(d)
        }
      }
      weekMon = addDays(weekMon, 7)
    }
  } else if (rule.daysOfMonth && rule.daysOfMonth.length) {
    let { y, m } = parseISO(start)
    let guard = 0
    while (guard++ < MAX) {
      if (compareISO(toISO(y, m, 1), genEnd) > 0) break
      for (const spec of rule.daysOfMonth) {
        const last = lastDayOfMonth(y, m)
        const day = spec === 'last' ? last : Math.min(spec, last)
        const d = toISO(y, m, day)
        if (compareISO(d, start) >= 0 && compareISO(d, genEnd) <= 0) nominal.push(d)
      }
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
  } else if (rule.nthWeekday) {
    let { y, m } = parseISO(start)
    let guard = 0
    while (guard++ < MAX) {
      if (compareISO(toISO(y, m, 1), genEnd) > 0) break
      const d = nthWeekdayOfMonth(y, m, rule.nthWeekday.weekday, rule.nthWeekday.nth)
      if (d && compareISO(d, start) >= 0 && compareISO(d, genEnd) <= 0) nominal.push(d)
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
  }

  // ajuste de día hábil (la UI predetermina 'previous'; el motor honra lo que venga en la regla)
  const dir = rule.businessDayAdjust ?? 'none'
  const out = new Set<string>()
  for (const d of nominal) {
    const adj = adjustToBusinessDay(d, dir)
    if (compareISO(adj, horizon.start) >= 0 && compareISO(adj, horizon.end) <= 0) out.add(adj)
  }
  return [...out].sort(compareISO)
}

function nthWeekdayOfMonth(
  y: number,
  m: number,
  weekday: Weekday,
  nth: 1 | 2 | 3 | 4 | 5 | 'last',
): string | null {
  const last = lastDayOfMonth(y, m)
  const matches: number[] = []
  for (let d = 1; d <= last; d++) {
    if (weekdayMon(toISO(y, m, d)) === weekday) matches.push(d)
  }
  if (!matches.length) return null
  const day = nth === 'last' ? matches[matches.length - 1] : matches[nth - 1]
  return day ? toISO(y, m, day) : null
}

export function expandRecurrence(rec: ScenarioRecurrence, horizon: Horizon): Movement[] {
  if (!rec.included) return []
  return ruleOccurrences(rec.rule, horizon).map((date, i) => ({
    id: `${rec.id}:${date}`,
    scenarioId: rec.scenarioId,
    kind: 'delta' as const,
    name: rec.name,
    amount: rec.amount,
    date,
    categoryId: rec.categoryId,
    cashEligible: rec.cashEligible,
    debitEligible: rec.debitEligible,
    creditEligible: rec.creditEligible,
    paidWith: rec.paidWith,
    included: true,
    source: { kind: 'recurrence' as const, ruleId: rec.id, occurrenceKey: `${rec.id}@${date}` },
    order: i,
  }))
}

export function expandAllRecurrences(recs: ScenarioRecurrence[], horizon: Horizon): Movement[] {
  return recs.flatMap((r) => expandRecurrence(r, horizon))
}

function daysBetween(a: ISODate, b: ISODate): number {
  const x = parseISO(a)
  const y = parseISO(b)
  return Math.round((Date.UTC(y.y, y.m - 1, y.d) - Date.UTC(x.y, x.m - 1, x.d)) / 86400000)
}

/** Infiere una regla simple (cada-N-días o mismo día del mes) a partir de fechas ya generadas.
 *  Sirve para EXTENDER series materializadas cuya regla no se guardó. Devuelve null si no es clara. */
export function inferRuleFromDates(dates: ISODate[]): RecurrenceRule | null {
  const ds = [...dates].filter(Boolean).sort(compareISO)
  if (ds.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < ds.length; i++) gaps.push(daysBetween(ds[i - 1], ds[i]))
  const g = gaps[0]
  if (g >= 1 && g <= 45 && gaps.every((x) => x === g)) {
    return { startDate: ds[0], every: { n: g, unit: 'day' } }
  }
  const doms = ds.map((d) => parseISO(d).d)
  if (doms.every((x) => x === doms[0])) {
    return { startDate: ds[0], daysOfMonth: [doms[0]] }
  }
  return null
}

export type RecurrencePreset =
  | 'once'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quincena'
  | 'every15'
  | 'bimonthly'

export const PRESET_LABELS: Record<RecurrencePreset, string> = {
  once: 'No se repite',
  weekly: 'Cada semana',
  biweekly: 'Cada 2 semanas',
  monthly: 'Cada mes',
  quincena: 'Quincena (15 y fin de mes)',
  every15: 'Cada 15 días',
  bimonthly: 'Cada 2 meses',
}

/** Construye una regla a partir de un preset y la fecha de inicio elegida. */
export function recurrenceFromPreset(
  preset: RecurrencePreset,
  startDate: ISODate,
): RecurrenceRule | undefined {
  if (preset === 'once') return undefined
  const weekday = weekdayMon(startDate)
  const dom = parseISO(startDate).d
  switch (preset) {
    case 'weekly':
      return { startDate, weekdays: [weekday] }
    case 'biweekly':
      return { startDate, every: { n: 2, unit: 'week' } }
    case 'monthly':
      return { startDate, daysOfMonth: [dom], businessDayAdjust: 'previous' }
    case 'quincena':
      return { startDate, daysOfMonth: [15, 'last'], businessDayAdjust: 'previous' }
    case 'every15':
      return { startDate, every: { n: 15, unit: 'day' } }
    case 'bimonthly':
      return { startDate, every: { n: 2, unit: 'month' } }
  }
}
