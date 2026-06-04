// Fechas date-only ISO ('YYYY-MM-DD'). Todo el cálculo usa UTC para evitar el bug de
// timezone de Safari iOS (que corre el día). No exponemos objetos Date al resto del dominio.
import type { ISODate, Weekday } from './types'

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

export function parseISO(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

function toUTC(iso: ISODate): Date {
  const { y, m, d } = parseISO(iso)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUTC(date: Date): ISODate {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function toISO(y: number, m: number, d: number): ISODate {
  return fromUTC(new Date(Date.UTC(y, m - 1, d)))
}

export function addDays(iso: ISODate, n: number): ISODate {
  const dt = toUTC(iso)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fromUTC(dt)
}

/** m es 1-based. */
export function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const { y, m, d } = parseISO(iso)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const ty = target.getUTCFullYear()
  const tm = target.getUTCMonth() + 1 // 1-based
  return toISO(ty, tm, Math.min(d, lastDayOfMonth(ty, tm)))
}

/** Lunes=0 … Domingo=6 */
export function weekdayMon(iso: ISODate): Weekday {
  const js = toUTC(iso).getUTCDay() // 0=Dom..6=Sab
  return ((js + 6) % 7) as Weekday
}

export function mondayOf(iso: ISODate): ISODate {
  return addDays(iso, -weekdayMon(iso))
}

export function sundayOf(iso: ISODate): ISODate {
  return addDays(mondayOf(iso), 6)
}

export function isWeekend(iso: ISODate): boolean {
  const w = weekdayMon(iso)
  return w === 5 || w === 6 // Sábado, Domingo
}

export function adjustToBusinessDay(iso: ISODate, dir: 'previous' | 'next' | 'none' = 'previous'): ISODate {
  if (dir === 'none') return iso
  const step = dir === 'previous' ? -1 : 1
  let cur = iso
  while (isWeekend(cur)) cur = addDays(cur, step)
  return cur
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Excel sistema 1900; epoch 1899-12-30 cubre todas las fechas >= 1900-03-01. */
export function parseExcelSerial(serial: number): ISODate {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000
  return fromUTC(new Date(ms))
}

export function monthNameES(m: number): string {
  return MONTHS_ES[m - 1]
}

/** "25 al 31 mayo" · cruza mes: "29 junio al 5 julio" · cruza año incluye año. */
export function weekRangeLabel(weekStart: ISODate): string {
  const start = parseISO(weekStart)
  const end = parseISO(sundayOf(weekStart))
  if (start.m === end.m && start.y === end.y) {
    return `${start.d} al ${end.d} ${monthNameES(start.m)}`
  }
  if (start.y !== end.y) {
    return `${start.d} ${monthNameES(start.m)} ${start.y} al ${end.d} ${monthNameES(end.m)} ${end.y}`
  }
  return `${start.d} ${monthNameES(start.m)} al ${end.d} ${monthNameES(end.m)}`
}

/** Todos los lunes (inicios de semana) dentro de [from, to]. */
export function eachWeekStart(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  const end = mondayOf(to)
  let cur = mondayOf(from)
  let guard = 0
  while (compareISO(cur, end) <= 0 && guard++ < 520) {
    out.push(cur)
    cur = addDays(cur, 7)
  }
  return out
}

const DOW_ABBR = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/** "Mié 3" — día de la semana abreviado + número de día. */
export function dayLabel(iso: ISODate): string {
  return `${DOW_ABBR[weekdayMon(iso)]} ${parseISO(iso).d}`
}
