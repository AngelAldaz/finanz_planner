// EL núcleo: simulación multi-cuenta (efectivo + débitos + créditos) con ruteo por prioridad.
import type { Cents, CreditCard, DebitAccount, ID, ISODate, LedgerPoint, Movement } from './types'
import { LIQUID } from './types'
import { compareISO } from './dates'

/** Fecha efectiva para agrupar/ordenar. */
export function effectiveDate(m: Movement): ISODate {
  return m.date ?? m.weekStart ?? '9999-12-31'
}

// Orden dentro de un mismo día: saldo real → bloqueos → ENTRADAS → SALIDAS (gastos y pagos).
function flowRank(m: Movement): number {
  if (m.kind === 'anchor') return 0
  if (m.cardBlock) return 1
  return m.amount > 0 ? 2 : 3 // entrada antes que salida
}

export function sortMovements(movements: Movement[]): Movement[] {
  return [...movements].sort((a, b) => {
    const c = compareISO(effectiveDate(a), effectiveDate(b))
    if (c !== 0) return c
    const r = flowRank(a) - flowRank(b)
    return r !== 0 ? r : a.order - b.order
  })
}

interface RouteCtx {
  cash: Map<ID, Cents>
  debt: Map<ID, Cents>
  blocked: Map<ID, boolean>
  cards: CreditCard[]
  liquidityOrder: ID[] // efectivo → débitos, en orden de prioridad
}

/**
 * Decide de QUÉ cuenta sale un gasto de monto `x` (>0), según:
 *  1) override manual (m.paidWith), si existe.
 *  2) prioridad efectivo → débitos → créditos, restringida a las cuentas PERMITIDAS
 *     (flags del gasto) y ENCENDIDAS: la primera que ALCANCE a cubrirlo.
 *  3) si ninguna alcanza: la de mayor prioridad permitida/encendida (queda en rojo).
 */
function routeExpense(m: Movement, x: Cents, ctx: RouteCtx): ID {
  const { cash, debt, blocked, cards, liquidityOrder } = ctx
  if (m.paidWith && (cash.has(m.paidWith) || debt.has(m.paidWith))) return m.paidWith

  const cashOk = m.cashEligible ?? true
  const debitOk = m.debitEligible ?? true
  const creditOk = m.creditEligible ?? false

  const candidates: ID[] = []
  for (const id of liquidityOrder) {
    if (blocked.get(id)) continue // efectivo nunca se bloquea → siempre pasa
    if (id === LIQUID ? cashOk : debitOk) candidates.push(id)
  }
  if (creditOk) for (const c of cards) if (!blocked.get(c.id)) candidates.push(c.id)

  for (const id of candidates) {
    if (cash.has(id)) {
      if ((cash.get(id) ?? 0) - x >= 0) return id
    } else {
      const c = cards.find((k) => k.id === id)
      if (c && c.limit - (debt.get(id) ?? 0) >= x) return id
    }
  }
  return candidates.length ? candidates[0] : LIQUID // en rojo sobre la de mayor prioridad
}

export function computeLedger(
  movements: Movement[],
  creditCards: CreditCard[] = [],
  debitAccounts: DebitAccount[] = [],
): LedgerPoint[] {
  const ordered = sortMovements(movements.filter((m) => m.included))
  const cards = [...creditCards].sort((a, b) => a.position - b.position)
  const debits = [...debitAccounts].sort((a, b) => a.position - b.position)

  const cash = new Map<ID, Cents>([[LIQUID, 0], ...debits.map((d) => [d.id, 0] as const)])
  const debt = new Map<ID, Cents>()
  const blocked = new Map<ID, boolean>()
  for (const c of cards) {
    debt.set(c.id, 0)
    blocked.set(c.id, false) // todas encendidas al inicio; los eventos las apagan/encienden
  }
  for (const d of debits) blocked.set(d.id, false)

  const liquidityOrder: ID[] = [LIQUID, ...debits.map((d) => d.id)]
  const ctx: RouteCtx = { cash, debt, blocked, cards, liquidityOrder }
  const totalCash = () => {
    let t = 0
    for (const v of cash.values()) t += v
    return t
  }

  const points: LedgerPoint[] = []
  for (const m of ordered) {
    const before = totalCash()
    let paidFrom: ID | undefined
    let charged: ID | undefined

    if (m.cardBlock) {
      // evento: enciende/apaga una cuenta (débito o crédito) a partir de aquí
      blocked.set(m.cardBlock.cardId, m.cardBlock.blocked)
    } else if (m.kind === 'anchor') {
      // fija el saldo REAL de una cuenta (efectivo default, un débito o una tarjeta)
      const acct = m.accountId ?? LIQUID
      if (cash.has(acct)) cash.set(acct, m.amount)
      else debt.set(acct, m.amount)
    } else if (m.payCardId) {
      // pago a tarjeta: sale de una cuenta de liquidez y abona a la deuda (regresa crédito)
      const src = m.paidWith && cash.has(m.paidWith) ? m.paidWith : LIQUID
      cash.set(src, (cash.get(src) ?? 0) + m.amount) // amount es negativo
      debt.set(m.payCardId, Math.max(0, (debt.get(m.payCardId) ?? 0) + m.amount))
      paidFrom = src
    } else if (m.amount >= 0) {
      // ingreso: entra a la cuenta elegida (efectivo default)
      const dest = m.paidWith && cash.has(m.paidWith) ? m.paidWith : LIQUID
      cash.set(dest, (cash.get(dest) ?? 0) + m.amount)
      paidFrom = dest
    } else {
      // gasto: ruteo por prioridad
      const x = -m.amount
      const target = routeExpense(m, x, ctx)
      if (cash.has(target)) cash.set(target, (cash.get(target) ?? 0) - x)
      else {
        debt.set(target, (debt.get(target) ?? 0) + x)
        charged = target
      }
      paidFrom = target
    }

    points.push({
      movement: m,
      balanceBefore: before,
      balanceAfter: totalCash(),
      isAnchor: m.kind === 'anchor',
      paidFrom,
      chargedToCardId: charged,
      cashAfter: Object.fromEntries(cash),
      cardDebtAfter: Object.fromEntries(debt),
      cardBlockedAfter: Object.fromEntries(blocked),
    })
  }
  return points
}
