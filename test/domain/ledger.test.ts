import { describe, it, expect } from 'vitest'
import { computeLedger, sortMovements } from '../../src/domain/ledger'
import { weekSummaries } from '../../src/domain/weeks'
import type { Movement, MovementKind } from '../../src/domain/types'

const make = (rows: Array<[string, number, MovementKind?, string?]>): Movement[] =>
  rows.map(([name, amount, kind = 'delta', week = '2026-05-25'], i) => ({
    id: `m${i}`,
    scenarioId: 's',
    kind,
    name,
    amount,
    weekStart: week,
    included: true,
    order: i,
  }))

describe('computeLedger', () => {
  it('mismo día: anchor primero, luego entradas y al final salidas', () => {
    const pts = computeLedger(
      make([
        ['gasto', -300],
        ['ingreso', 500],
        ['inicio', 1000, 'anchor'],
      ]),
    )
    // sin importar el orden de captura: saldo real → entrada → salida
    expect(pts.map((p) => p.movement.name)).toEqual(['inicio', 'ingreso', 'gasto'])
    expect(pts.map((p) => p.balanceAfter)).toEqual([1000, 1500, 1200])
  })

  it('un anchor en una semana posterior re-ancla al saldo real', () => {
    const pts = computeLedger(
      make([
        ['inicio', 1000, 'anchor', '2026-05-25'],
        ['gasto', -300, 'delta', '2026-05-25'],
        ['saldo real', 5000, 'anchor', '2026-06-01'],
        ['gasto', -1000, 'delta', '2026-06-01'],
      ]),
    )
    expect(pts.map((p) => p.balanceAfter)).toEqual([1000, 700, 5000, 4000])
  })

  it('respeta el flag included', () => {
    const m = make([
      ['a', 1000, 'anchor'],
      ['b', -500],
    ])
    m[1].included = false
    expect(computeLedger(m).map((p) => p.balanceAfter)).toEqual([1000])
  })
})

describe('weekSummaries', () => {
  it('calcula mínimo, en rojo y totales', () => {
    const pts = computeLedger(
      make([
        ['inicio', 100, 'anchor'],
        ['ingreso', 200],
        ['gasto', -500],
      ]),
    )
    const [w] = weekSummaries(pts)
    // entrada primero (100 → 300) y luego la salida (→ -200)
    expect(w.lowestBalance).toBe(-200)
    expect(w.goesNegative).toBe(true)
    expect(w.closingBalance).toBe(-200)
    expect(w.totalIn).toBe(200)
    expect(w.totalOut).toBe(-500)
    expect(w.hadAnchor).toBe(true)
    expect(w.key.label).toBe('25 al 31 mayo')
  })
})

describe('sortMovements', () => {
  it('ordena por fecha efectiva antes que por el campo order', () => {
    const base = { scenarioId: 's', kind: 'delta' as const, amount: -100, included: true }
    const viaje6: Movement = { ...base, id: 'a', name: 'viaje', date: '2026-06-06', order: 0 }
    const compras3: Movement = { ...base, id: 'b', name: 'compras', date: '2026-06-03', order: 5 }
    expect(sortMovements([viaje6, compras3]).map((m) => m.name)).toEqual(['compras', 'viaje'])
  })
})
