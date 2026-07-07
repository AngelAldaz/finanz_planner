import { describe, it, expect } from 'vitest'
import { computeLedger } from '../../src/domain/ledger'
import type { CreditCard, DebitAccount, Movement } from '../../src/domain/types'
import { LIQUID } from '../../src/domain/types'

const card = (id: string, limit: number, position = 0): CreditCard => ({
  id,
  name: id,
  limit,
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

const debits = [debit('bbva', 0), debit('banorte', 1)]

describe('liquidez: efectivo + débitos', () => {
  it('el saldo líquido es la SUMA de efectivo y débitos', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 10000 }), // efectivo 100
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 25000, accountId: 'bbva' }), // débito 250
      ],
      [],
      debits,
    )
    const last = pts[pts.length - 1]
    expect(last.cashAfter[LIQUID]).toBe(10000)
    expect(last.cashAfter['bbva']).toBe(25000)
    expect(last.balanceAfter).toBe(35000) // total liquidez
  })

  it('un ingreso entra a la cuenta elegida (paidWith)', () => {
    const pts = computeLedger(
      [mv({ name: 'sueldo', amount: 50000, paidWith: 'bbva' })],
      [],
      debits,
    )
    expect(pts[0].cashAfter['bbva']).toBe(50000)
    expect(pts[0].cashAfter[LIQUID]).toBe(0)
    expect(pts[0].paidFrom).toBe('bbva')
  })

  it('prioridad efectivo → débito: paga con efectivo si alcanza', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'taco', amount: -20000 }), // efectivo y débito permitidos (default) → efectivo primero
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe(LIQUID)
    expect(p.cashAfter[LIQUID]).toBe(80000)
    expect(p.cashAfter['bbva']).toBe(100000)
  })

  it('si el efectivo no alcanza, pasa al primer débito de la jerarquía', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 10000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'compra', amount: -50000 }), // efectivo (100) no cubre → bbva
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('bbva')
    expect(p.cashAfter['bbva']).toBe(50000)
    expect(p.cashAfter[LIQUID]).toBe(10000)
  })

  it('gasto NO pagable con efectivo salta directo al débito', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'suscripción', amount: -20000, cashEligible: false }), // solo débito/crédito
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('bbva')
    expect(p.cashAfter[LIQUID]).toBe(100000)
  })

  it('efectivo + crédito (sin débito): efectivo si alcanza, si no crédito', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 3000 }),
        mv({ name: 'compra', amount: -50000, debitEligible: false, creditEligible: true }),
      ],
      [card('visa', 500000)],
      debits, // hay débitos pero el gasto NO los permite
    )
    const p = pts[pts.length - 1]
    expect(p.chargedToCardId).toBe('visa')
    expect(p.cashAfter[LIQUID]).toBe(3000) // el efectivo no se tocó
  })

  it('override manual: lo pagué con un débito específico aunque el efectivo alcanzara', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'compra', amount: -20000, paidWith: 'bbva' }),
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('bbva')
    expect(p.cashAfter['bbva']).toBe(80000)
    expect(p.cashAfter[LIQUID]).toBe(100000)
  })

  it('un débito apagado por evento se salta en el ruteo', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 0, weekStart: '2026-05-25' }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva', weekStart: '2026-05-25' }),
        mv({ name: 'apagar bbva', amount: 0, cardBlock: { cardId: 'bbva', blocked: true }, weekStart: '2026-06-01' }),
        mv({ name: 'compra', amount: -50000, weekStart: '2026-06-01' }), // efectivo 0, bbva apagada → efectivo en rojo
      ],
      [],
      debits,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe(LIQUID)
    expect(p.cashAfter[LIQUID]).toBe(-50000) // en rojo: nada más lo podía cubrir
    expect(p.cashAfter['bbva']).toBe(100000)
  })
})
