// Agrupación por semana (lunes→domingo) y resúmenes.
import type { ISODate, LedgerPoint, WeekKey, WeekSummary } from './types'
import { mondayOf, sundayOf, weekRangeLabel } from './dates'
import { effectiveDate } from './ledger'

export function groupIntoWeeks(points: LedgerPoint[]): Map<ISODate, LedgerPoint[]> {
  const map = new Map<ISODate, LedgerPoint[]>()
  for (const p of points) {
    const wk = mondayOf(effectiveDate(p.movement))
    const arr = map.get(wk)
    if (arr) arr.push(p)
    else map.set(wk, [p])
  }
  return map
}

export function weekSummaries(points: LedgerPoint[]): WeekSummary[] {
  const groups = groupIntoWeeks(points)
  const weekStarts = [...groups.keys()].sort()
  return weekStarts.map((weekStart) => {
    const pts = groups.get(weekStart)!
    const key: WeekKey = {
      weekStart,
      weekEnd: sundayOf(weekStart),
      label: weekRangeLabel(weekStart),
    }
    let totalIn = 0
    let totalOut = 0
    let lowest = pts[0].balanceAfter
    let lowestAt: ISODate | undefined = effectiveDate(pts[0].movement)
    let hadAnchor = false
    let goesNegative = false
    for (const p of pts) {
      const m = p.movement
      if (m.kind === 'anchor') hadAnchor = true
      else if (m.amount > 0) totalIn += m.amount
      else totalOut += m.amount
      if (p.balanceAfter < lowest) {
        lowest = p.balanceAfter
        lowestAt = effectiveDate(m)
      }
      if (p.balanceAfter < 0) goesNegative = true
    }
    return {
      key,
      points: pts,
      openingBalance: pts[0].balanceBefore,
      closingBalance: pts[pts.length - 1].balanceAfter,
      totalIn,
      totalOut,
      lowestBalance: lowest,
      lowestAt,
      hadAnchor,
      goesNegative,
      cardDebtClosing: pts[pts.length - 1].cardDebtAfter,
    }
  })
}
