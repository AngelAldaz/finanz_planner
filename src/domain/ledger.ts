// EL núcleo: saldo corriente respetando anchors.
import type { ISODate, LedgerPoint, Movement } from './types'
import { compareISO } from './dates'

/** Fecha efectiva para agrupar/ordenar. */
export function effectiveDate(m: Movement): ISODate {
  return m.date ?? m.weekStart ?? '9999-12-31'
}

export function sortMovements(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) => {
    const c = compareISO(effectiveDate(a), effectiveDate(b))
    return c !== 0 ? c : a.order - b.order
  })
}

export function computeLedger(movements: Movement[]): LedgerPoint[] {
  const ordered = sortMovements(movements.filter((m) => m.included))
  const points: LedgerPoint[] = []
  let balance = 0
  for (const m of ordered) {
    const balanceBefore = balance
    balance = m.kind === 'anchor' ? m.amount : balance + m.amount
    points.push({
      movement: m,
      balanceBefore,
      balanceAfter: balance,
      isAnchor: m.kind === 'anchor',
    })
  }
  return points
}
