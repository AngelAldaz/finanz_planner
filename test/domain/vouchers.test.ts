import { describe, it, expect } from 'vitest'
import { computeLedger } from '../../src/domain/ledger'
import { buildComputedScenario } from '../../src/domain/plan'
import type { DebitAccount, Movement, VoucherAccount } from '../../src/domain/types'
import { LIQUID } from '../../src/domain/types'

const voucher = (id: string, position = 0): VoucherAccount => ({
  id,
  name: id,
  color: '#000',
  position,
})
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

const vales = [voucher('despensa', 0), voucher('restaurante', 1)]

describe('tarjetas de vales: aparte del líquido y SOLO por asignación manual', () => {
  it('una carga de vales (ingreso con paidWith) entra a la tarjeta de vales, no al líquido', () => {
    const pts = computeLedger(
      [mv({ name: 'carga', amount: 300000, paidWith: 'despensa' })],
      [],
      [],
      vales,
    )
    const p = pts[0]
    expect(p.voucherAfter['despensa']).toBe(300000)
    expect(p.cashAfter[LIQUID]).toBe(0)
    expect(p.balanceAfter).toBe(0) // el líquido no cambia
    expect(p.paidFrom).toBe('despensa')
  })

  it('un gasto asignado a vales sale de esa tarjeta y no toca el líquido', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'carga', amount: 300000, paidWith: 'despensa' }),
        mv({ name: 'súper', amount: -120000, paidWith: 'despensa' }),
      ],
      [],
      [],
      vales,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('despensa')
    expect(p.voucherAfter['despensa']).toBe(180000)
    expect(p.cashAfter[LIQUID]).toBe(100000)
    expect(p.balanceAfter).toBe(100000)
  })

  it('NUNCA usa vales en automático, ni aunque el líquido no alcance', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 0 }),
        mv({ name: 'carga', amount: 300000, paidWith: 'despensa' }),
        mv({ name: 'súper', amount: -50000 }), // sin paidWith → efectivo en rojo, vales intactos
      ],
      [],
      [debit('bbva')],
      vales,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe(LIQUID)
    expect(p.cashAfter[LIQUID]).toBe(-50000)
    expect(p.voucherAfter['despensa']).toBe(300000)
  })

  it('el saldo real (anchor) puede fijar una tarjeta de vales', () => {
    const pts = computeLedger(
      [mv({ name: 'saldo vales', kind: 'anchor', amount: 45000, accountId: 'restaurante' })],
      [],
      [],
      vales,
    )
    expect(pts[0].voucherAfter['restaurante']).toBe(45000)
    expect(pts[0].voucherAfter['despensa']).toBe(0)
    expect(pts[0].balanceAfter).toBe(0)
  })

  it('cada tarjeta de vales lleva su saldo por separado y se reporta en el escenario', () => {
    const c = buildComputedScenario({
      movements: [
        mv({ name: 'carga', amount: 300000, paidWith: 'despensa', date: '2026-05-25' }),
        mv({ name: 'cena', amount: 20000, paidWith: 'restaurante', date: '2026-05-25' }),
        mv({ name: 'súper', amount: -100000, paidWith: 'despensa', date: '2026-05-26' }),
      ],
      voucherAccounts: vales,
      horizon: { start: '2026-05-25', end: '2026-06-28' },
      today: '2026-05-25',
    })
    expect(c.finalBalance).toBe(0)
    expect(c.voucherStates.map((v) => [v.id, v.balance])).toEqual([
      ['despensa', 200000],
      ['restaurante', 20000],
    ])
    expect(c.voucherStatesToday.find((v) => v.id === 'despensa')?.balance).toBe(300000)
    expect(c.weeks[0].voucherClosing['despensa']).toBe(200000)
    // los flujos de vales no cuentan como entradas/salidas de liquidez
    expect(c.weeks[0].totalIn).toBe(0)
    expect(c.weeks[0].totalOut).toBe(0)
  })
})
