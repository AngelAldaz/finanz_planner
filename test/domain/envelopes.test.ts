import { describe, it, expect } from 'vitest'
import { computeLedger } from '../../src/domain/ledger'
import { buildComputedScenario } from '../../src/domain/plan'
import type { DebitAccount, Envelope, Movement } from '../../src/domain/types'
import { LIQUID } from '../../src/domain/types'

const debit = (id: string, position = 0): DebitAccount => ({ id, name: id, color: '#000', position })
const envelope = (id: string, accountId: string, position = 0): Envelope => ({
  id,
  accountId,
  name: id,
  color: '#000',
  position,
})

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

const debits = [debit('bbva', 0)]
const envs = [envelope('vacaciones', 'bbva', 0), envelope('renta', LIQUID, 1)]

describe('apartados: dinero dentro de la cuenta que el ruteo automático no toca', () => {
  it('apartar (traspaso cuenta → apartado) no cambia el total de la cuenta, solo lo libre', () => {
    const pts = computeLedger(
      [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'apartar', amount: 40000, transfer: { fromId: 'bbva', toId: 'vacaciones' } }),
      ],
      [],
      debits,
      [],
      envs,
    )
    const p = pts[pts.length - 1]
    expect(p.cashAfter['bbva']).toBe(100000) // el dinero sigue en la cuenta
    expect(p.freeAfter['bbva']).toBe(60000) // pero solo 60 está libre
    expect(p.envelopeAfter['vacaciones']).toBe(40000)
    expect(p.reservedAfter).toBe(40000)
    expect(p.balanceAfter).toBe(60000) // la liquidez disponible baja
    expect(p.balanceAfter + p.reservedAfter).toBe(100000)
  })

  it('el ruteo automático solo usa el dinero LIBRE: si no alcanza, brinca de cuenta', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 50000, accountId: 'bbva' }),
        mv({ name: 'apartar renta', amount: 90000, transfer: { fromId: LIQUID, toId: 'renta' } }),
        mv({ name: 'súper', amount: -30000 }), // efectivo libre = 10 → no alcanza → bbva
      ],
      [],
      debits,
      [],
      envs,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('bbva')
    expect(p.cashAfter[LIQUID]).toBe(100000)
    expect(p.envelopeAfter['renta']).toBe(90000)
    expect(p.cashAfter['bbva']).toBe(20000)
  })

  it('si ninguna cuenta tiene libre suficiente, cae en rojo en el LIBRE de la primera (el apartado queda intacto)', () => {
    const pts = computeLedger(
      [
        mv({ name: 'efectivo', kind: 'anchor', amount: 100000 }),
        mv({ name: 'apartar renta', amount: 90000, transfer: { fromId: LIQUID, toId: 'renta' } }),
        mv({ name: 'compra', amount: -50000 }),
      ],
      [],
      [],
      [],
      [envelope('renta', LIQUID)],
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe(LIQUID)
    expect(p.freeAfter[LIQUID]).toBe(-40000)
    expect(p.envelopeAfter['renta']).toBe(90000)
    expect(p.balanceAfter).toBe(-40000)
  })

  it('gasto asignado a un apartado sale del apartado (y de su cuenta), el libre no se mueve', () => {
    const pts = computeLedger(
      [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'apartar', amount: 40000, transfer: { fromId: 'bbva', toId: 'vacaciones' } }),
        mv({ name: 'vuelo', amount: -25000, paidWith: 'vacaciones' }),
      ],
      [],
      debits,
      [],
      envs,
    )
    const p = pts[pts.length - 1]
    expect(p.paidFrom).toBe('bbva')
    expect(p.envelopeId).toBe('vacaciones')
    expect(p.envelopeAfter['vacaciones']).toBe(15000)
    expect(p.cashAfter['bbva']).toBe(75000)
    expect(p.freeAfter['bbva']).toBe(60000)
    expect(p.balanceAfter).toBe(60000)
  })

  it('gasto asignado a la CUENTA (sin apartado) usa solo lo libre de esa cuenta', () => {
    const pts = computeLedger(
      [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'apartar', amount: 40000, transfer: { fromId: 'bbva', toId: 'vacaciones' } }),
        mv({ name: 'cena', amount: -10000, paidWith: 'bbva' }),
      ],
      [],
      debits,
      [],
      envs,
    )
    const p = pts[pts.length - 1]
    expect(p.envelopeId).toBeUndefined()
    expect(p.envelopeAfter['vacaciones']).toBe(40000)
    expect(p.freeAfter['bbva']).toBe(50000)
  })

  it('sacar del apartado (apartado → cuenta) libera el dinero; apartado → otra cuenta mueve el efectivo', () => {
    const pts = computeLedger(
      [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'apartar', amount: 40000, transfer: { fromId: 'bbva', toId: 'vacaciones' } }),
        mv({ name: 'sacar', amount: 10000, transfer: { fromId: 'vacaciones', toId: 'bbva' } }),
        mv({ name: 'a efectivo', amount: 5000, transfer: { fromId: 'vacaciones', toId: LIQUID } }),
      ],
      [],
      debits,
      [],
      envs,
    )
    const p = pts[pts.length - 1]
    expect(p.envelopeAfter['vacaciones']).toBe(25000)
    expect(p.cashAfter['bbva']).toBe(95000)
    expect(p.freeAfter['bbva']).toBe(70000)
    expect(p.cashAfter[LIQUID]).toBe(5000)
  })

  it('ingreso y pago de tarjeta pueden ir a / salir de un apartado', () => {
    const pts = computeLedger(
      [
        mv({ name: 'aguinaldo', amount: 20000, paidWith: 'vacaciones' }),
        mv({ name: 'pago visa', amount: -8000, payCardId: 'visa', paidWith: 'vacaciones' }),
      ],
      [{ id: 'visa', name: 'visa', limit: 100000, color: '#000', position: 0 }],
      debits,
      [],
      envs,
    )
    expect(pts[0].envelopeAfter['vacaciones']).toBe(20000)
    expect(pts[0].cashAfter['bbva']).toBe(20000)
    expect(pts[0].freeAfter['bbva']).toBe(0)
    const p = pts[1]
    expect(p.envelopeAfter['vacaciones']).toBe(12000)
    expect(p.cashAfter['bbva']).toBe(12000)
    expect(p.envelopeId).toBe('vacaciones')
  })

  it('un apartado de una cuenta que no existe se ignora; saldo real puede fijar un apartado', () => {
    const pts = computeLedger(
      [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva' }),
        mv({ name: 'saldo apartado', kind: 'anchor', amount: 30000, accountId: 'vacaciones' }),
      ],
      [],
      debits,
      [],
      [...envs, envelope('fantasma', 'no-existe')],
    )
    const p = pts[pts.length - 1]
    expect(p.envelopeAfter['vacaciones']).toBe(30000)
    expect(p.envelopeId).toBe('vacaciones')
    expect(p.cashAfter['bbva']).toBe(100000) // el total de la cuenta no cambia
    expect(p.envelopeAfter['fantasma']).toBeUndefined()
    expect(p.freeAfter['bbva']).toBe(70000)
  })

  it('el escenario reporta libre/apartado por cuenta y el saldo de cada apartado', () => {
    const c = buildComputedScenario({
      movements: [
        mv({ name: 'saldo bbva', kind: 'anchor', amount: 100000, accountId: 'bbva', date: '2026-05-25' }),
        mv({ name: 'apartar', amount: 40000, date: '2026-05-25', transfer: { fromId: 'bbva', toId: 'vacaciones' } }),
        mv({ name: 'taco', amount: -5000, date: '2026-05-26' }),
      ],
      debitAccounts: debits,
      envelopes: envs,
      horizon: { start: '2026-05-25', end: '2026-06-28' },
      today: '2026-05-25',
    })
    expect(c.finalBalance).toBe(55000) // disponible
    expect(c.finalReserved).toBe(40000)
    const bbva = c.cashStates.find((s) => s.id === 'bbva')!
    expect(bbva).toMatchObject({ balance: 95000, free: 55000, reserved: 40000 })
    expect(c.envelopeStates.map((e) => [e.envelope.id, e.balance])).toEqual([
      ['vacaciones', 40000],
      ['renta', 0],
    ])
    expect(c.weeks[0].reservedClosing).toBe(40000)
    expect(c.weeks[0].totalOut).toBe(-5000) // apartar no es salida
    expect(c.minBalance).toBe(55000)
  })
})
