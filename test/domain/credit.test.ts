import { describe, it, expect } from 'vitest'
import { computeLedger } from '../../src/domain/ledger'
import { buildComputedScenario } from '../../src/domain/plan'
import type { CreditCard, Movement } from '../../src/domain/types'

const card = (id: string, limit: number): CreditCard => ({
  id,
  name: id,
  limit,
  color: '#000',
  position: 0,
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

describe('enrutado débito/crédito', () => {
  it('usa crédito SOLO cuando pagar con débito te dejaría en rojo', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 100000 }), // $1,000 líquido
        mv({ name: 'chico', amount: -30000, creditEligible: true }), // débito (queda $700)
        mv({ name: 'grande', amount: -120000, creditEligible: true }), // $700-$1,200<0 → crédito
      ],
      [card('visa', 500000)],
    )
    expect(pts[1].chargedToCardId).toBeUndefined()
    expect(pts[1].balanceAfter).toBe(70000)
    expect(pts[2].chargedToCardId).toBe('visa')
    expect(pts[2].balanceAfter).toBe(70000) // el líquido no cambió
    expect(pts[2].cardDebtAfter['visa']).toBe(120000)
  })

  it('un gasto NO elegible se va a rojo aunque haya crédito disponible', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 100000 }),
        mv({ name: 'renta', amount: -120000, creditEligible: false }),
      ],
      [card('visa', 500000)],
    )
    expect(pts[1].chargedToCardId).toBeUndefined()
    expect(pts[1].balanceAfter).toBe(-20000)
    expect(pts[1].cardDebtAfter['visa']).toBe(0)
  })

  it('pagar la tarjeta baja el líquido y regresa el crédito disponible', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 100000 }),
        mv({ name: 'compra', amount: -120000, creditEligible: true }), // crédito → deuda 120000
        mv({ name: 'ingreso', amount: 200000 }), // líquido 300000
        mv({ name: 'pago visa', amount: -120000, payCardId: 'visa' }), // líquido 180000, deuda 0
      ],
      [card('visa', 500000)],
    )
    const last = pts[pts.length - 1]
    expect(last.balanceAfter).toBe(180000)
    expect(last.cardDebtAfter['visa']).toBe(0)
  })

  it('elige la tarjeta con MÁS crédito disponible', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 0 }),
        mv({ name: 'compra', amount: -50000, creditEligible: true }),
      ],
      [card('a', 100000), card('b', 300000)],
    )
    expect(pts[1].chargedToCardId).toBe('b')
    expect(pts[1].cardDebtAfter['b']).toBe(50000)
    expect(pts[1].cardDebtAfter['a']).toBe(0)
  })

  it('un anchor de tarjeta fija su deuda real sin tocar el líquido', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 100000 }),
        mv({ name: 'saldo real visa', kind: 'anchor', amount: 200000, accountId: 'visa' }),
      ],
      [card('visa', 500000)],
    )
    const last = pts[pts.length - 1]
    expect(last.cardDebtAfter['visa']).toBe(200000)
    expect(last.balanceAfter).toBe(100000)
  })

  it('buildComputedScenario expone cardStates (deuda y disponible)', () => {
    const computed = buildComputedScenario({
      movements: [
        mv({ name: 'inicio', kind: 'anchor', amount: 0 }),
        mv({ name: 'compra', amount: -50000, creditEligible: true }),
      ],
      cards: [card('visa', 500000)],
      horizon: { start: '2026-05-25', end: '2026-05-31' },
    })
    expect(computed.cardStates).toHaveLength(1)
    expect(computed.cardStates[0].debt).toBe(50000)
    expect(computed.cardStates[0].available).toBe(450000)
  })

  it('un evento de bloqueo apaga la tarjeta a partir de ahí', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 0 }),
        mv({ name: 'compra A', amount: -50000, creditEligible: true }), // antes → crédito
        mv({ name: 'bloquear', amount: 0, cardBlock: { cardId: 'visa', blocked: true } }),
        mv({ name: 'compra B', amount: -50000, creditEligible: true }), // ya apagada → débito (rojo)
      ],
      [card('visa', 500000)],
    )
    expect(pts[1].chargedToCardId).toBe('visa')
    expect(pts[3].chargedToCardId).toBeUndefined()
    expect(pts[3].balanceAfter).toBe(-50000)
  })

  it('un evento de reactivación vuelve a encender la tarjeta', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 0 }),
        mv({ name: 'bloquear', amount: 0, cardBlock: { cardId: 'visa', blocked: true } }),
        mv({ name: 'reactivar', amount: 0, cardBlock: { cardId: 'visa', blocked: false } }),
        mv({ name: 'compra', amount: -50000, creditEligible: true }), // encendida → crédito
      ],
      [card('visa', 500000)],
    )
    expect(pts[3].chargedToCardId).toBe('visa')
  })

  it('una tarjeta apagada por evento SÍ puede pagarse', () => {
    const pts = computeLedger(
      [
        mv({ name: 'inicio', kind: 'anchor', amount: 100000 }),
        mv({ name: 'deuda real visa', kind: 'anchor', amount: 80000, accountId: 'visa' }),
        mv({ name: 'bloquear', amount: 0, cardBlock: { cardId: 'visa', blocked: true } }),
        mv({ name: 'pago visa', amount: -50000, payCardId: 'visa' }),
      ],
      [card('visa', 500000)],
    )
    const last = pts[pts.length - 1]
    expect(last.cardDebtAfter['visa']).toBe(30000)
    expect(last.balanceAfter).toBe(50000)
  })
})
