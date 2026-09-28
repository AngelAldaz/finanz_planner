import { describe, it, expect } from 'vitest'
import { computeLedger } from '../../src/domain/ledger'
import { buildComputedScenario } from '../../src/domain/plan'
import { expandRecurrence } from '../../src/domain/recurrence'
import type { DebitAccount, Movement, ScenarioRecurrence } from '../../src/domain/types'
import { LIQUID } from '../../src/domain/types'

const debit = (id: string, position = 0): DebitAccount => ({ id, name: id, color: '#000', position })

let order = 0
function mv(p: Partial<Movement> & { amount: number }): Movement {
  return {
    id: `m${order}`,
    scenarioId: 's',
    kind: 'delta',
    name: 'x',
    included: true,
    weekStart: '2026-05-25',
    order: order++,
    ...p,
  }
}

const debits = [debit('bbva', 0), debit('ahorro', 1)]

describe('traspasos entre cuentas de liquidez', () => {
  it('mueve el monto de una cuenta a otra sin cambiar el líquido total', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 500000, accountId: 'bbva' }),
        mv({ name: 'a ahorro', amount: 200000, transfer: { fromId: 'bbva', toId: 'ahorro' } }),
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.cashAfter['bbva']).toBe(300000)
    expect(p.cashAfter['ahorro']).toBe(200000)
    expect(p.cashAfter[LIQUID]).toBe(100000)
    expect(p.balanceBefore).toBe(600000)
    expect(p.balanceAfter).toBe(600000)
    expect(p.paidFrom).toBe('bbva')
    expect(p.transferredTo).toBe('ahorro')
  })

  it('efectivo ↔ débito en ambos sentidos', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 50000 }),
        mv({ name: 'retiro', amount: 30000, transfer: { fromId: 'bbva', toId: LIQUID } }),
        mv({ name: 'depósito', amount: 10000, transfer: { fromId: LIQUID, toId: 'bbva' } }),
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.cashAfter[LIQUID]).toBe(70000)
    expect(p.cashAfter['bbva']).toBe(-20000) // puede dejar la cuenta en rojo: es lo que pediste mover
    expect(p.balanceAfter).toBe(50000)
  })

  it('el mismo día: entra la nómina → se traspasa → se paga el gasto', () => {
    const pts = computeLedger(
      [
        mv({ name: 'renta', amount: -80000, date: '2026-05-25', cashEligible: false }), // solo débito
        mv({ name: 'a bbva', amount: 80000, date: '2026-05-25', transfer: { fromId: LIQUID, toId: 'bbva' } }),
        mv({ name: 'nómina', amount: 100000, date: '2026-05-25' }), // entra a efectivo
      ],
      [],
      [debit('bbva')],
    )
    expect(pts.map((p) => p.movement.name)).toEqual(['nómina', 'a bbva', 'renta'])
    const last = pts[pts.length - 1]
    expect(last.paidFrom).toBe('bbva')
    expect(last.cashAfter['bbva']).toBe(0)
    expect(last.cashAfter[LIQUID]).toBe(20000)
  })

  it('origen = destino o cuenta desconocida → no rompe nada', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 10000 }),
        mv({ name: 'nada', amount: 5000, transfer: { fromId: 'bbva', toId: 'bbva' } }),
        mv({ name: 'a fantasma', amount: 5000, transfer: { fromId: LIQUID, toId: 'no-existe' } }),
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.cashAfter[LIQUID]).toBe(10000)
    expect(p.cashAfter['bbva']).toBe(0)
  })

  it('no cuenta como entrada ni salida en los totales de la semana', () => {
    const c = buildComputedScenario({
      movements: [
        mv({ name: 'saldo', kind: 'anchor', amount: 100000, date: '2026-05-25' }),
        mv({ name: 'a bbva', amount: 40000, date: '2026-05-26', transfer: { fromId: LIQUID, toId: 'bbva' } }),
        mv({ name: 'taco', amount: -5000, date: '2026-05-27' }),
      ],
      debitAccounts: [debit('bbva')],
      horizon: { start: '2026-05-25', end: '2026-06-28' },
    })
    expect(c.weeks[0].totalIn).toBe(0)
    expect(c.weeks[0].totalOut).toBe(-5000)
    expect(c.weeks[0].closingBalance).toBe(95000)
    expect(c.cashStates.find((s) => s.id === 'bbva')?.balance).toBe(40000)
  })

  it('un traspaso recurrente conserva origen/destino en cada ocurrencia', () => {
    const rec: ScenarioRecurrence = {
      id: 'r1',
      scenarioId: 's',
      name: 'a ahorro',
      amount: 200000,
      transfer: { fromId: 'bbva', toId: 'ahorro' },
      rule: { startDate: '2026-06-01', daysOfMonth: [1], businessDayAdjust: 'none' },
      included: true,
    }
    const out = expandRecurrence(rec, { start: '2026-06-01', end: '2026-08-31' })
    expect(out).toHaveLength(3)
    for (const m of out) expect(m.transfer).toEqual({ fromId: 'bbva', toId: 'ahorro' })
  })
})
