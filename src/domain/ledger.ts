// EL núcleo: simulación multi-cuenta (líquido + tarjetas) con enrutado débito/crédito.
import type { Cents, CreditCard, ID, ISODate, LedgerPoint, Movement } from './types'
import { LIQUID } from './types'
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

/** Tarjeta con MÁS crédito disponible que pueda cubrir `amount`. */
function bestCardFor(amount: Cents, cards: CreditCard[], debt: Map<ID, Cents>): ID | undefined {
  let best: ID | undefined
  let bestAvail = -1
  for (const c of cards) {
    const avail = c.limit - (debt.get(c.id) ?? 0)
    if (avail >= amount && avail > bestAvail) {
      bestAvail = avail
      best = c.id
    }
  }
  return best
}

export function computeLedger(movements: Movement[], cards: CreditCard[] = []): LedgerPoint[] {
  const ordered = sortMovements(movements.filter((m) => m.included))
  const points: LedgerPoint[] = []
  let liquid = 0
  const debt = new Map<ID, Cents>()
  for (const c of cards) debt.set(c.id, 0)

  for (const m of ordered) {
    const before = liquid
    let charged: ID | undefined

    if (m.kind === 'anchor') {
      // fija el saldo REAL de una cuenta (líquido por default, o una tarjeta)
      const acct = m.accountId ?? LIQUID
      if (acct === LIQUID) liquid = m.amount
      else debt.set(acct, m.amount)
    } else if (m.payCardId) {
      // pago a tarjeta: baja el líquido y abona a la deuda (regresa crédito)
      liquid += m.amount // amount es negativo
      const cur = debt.get(m.payCardId) ?? 0
      debt.set(m.payCardId, Math.max(0, cur + m.amount))
    } else if (m.amount >= 0) {
      liquid += m.amount // ingreso
    } else {
      // gasto: débito primero; crédito SOLO si pagar con débito te deja en rojo
      const x = -m.amount
      if (m.creditEligible && liquid - x < 0) {
        const card = bestCardFor(x, cards, debt)
        if (card) {
          debt.set(card, (debt.get(card) ?? 0) + x)
          charged = card
        }
      }
      if (!charged) liquid -= x
    }

    points.push({
      movement: m,
      balanceBefore: before,
      balanceAfter: liquid,
      isAnchor: m.kind === 'anchor',
      chargedToCardId: charged,
      cardDebtAfter: Object.fromEntries(debt),
    })
  }
  return points
}
