// EL núcleo: simulación multi-cuenta (efectivo + débitos + créditos + vales) con ruteo por prioridad.
// Los vales van APARTE: no son liquidez y nunca se eligen solos (solo por `paidWith` manual).
import type {
  Cents,
  CreditCard,
  DebitAccount,
  Envelope,
  ID,
  ISODate,
  LedgerPoint,
  Movement,
  VoucherAccount,
} from './types'
import { LIQUID } from './types'
import { compareISO } from './dates'

/** Fecha efectiva para agrupar/ordenar. */
export function effectiveDate(m: Movement): ISODate {
  return m.date ?? m.weekStart ?? '9999-12-31'
}

// Orden dentro de un mismo día: saldo real → bloqueos → ENTRADAS → TRASPASOS → SALIDAS (gastos y pagos).
// El traspaso va después de las entradas (ya llegó la nómina) y antes de las salidas (ya está el dinero).
function flowRank(m: Movement): number {
  if (m.kind === 'anchor') return 0
  if (m.cardBlock) return 1
  if (m.transfer) return 3
  return m.amount > 0 ? 2 : 4 // entrada antes que salida
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
  voucher: Map<ID, Cents>
  env: Map<ID, Cents> // saldo por apartado
  envAcct: Map<ID, ID> // apartado → cuenta de liquidez dueña
  freeOf: (acct: ID) => Cents // libre = total − apartados de esa cuenta
  debt: Map<ID, Cents>
  blocked: Map<ID, boolean>
  cards: CreditCard[]
  liquidityOrder: ID[] // efectivo → débitos, en orden de prioridad
}

/**
 * Decide de QUÉ cuenta sale un gasto de monto `x` (>0), según:
 *  1) override manual (m.paidWith), si existe. Es la ÚNICA forma de que salga de vales o de
 *     un apartado.
 *  2) prioridad efectivo → débitos → créditos, restringida a las cuentas PERMITIDAS
 *     (flags del gasto) y ENCENDIDAS: la primera cuyo dinero LIBRE (no apartado) ALCANCE.
 *  3) si ninguna alcanza: la de mayor prioridad permitida/encendida (queda en rojo).
 */
function routeExpense(m: Movement, x: Cents, ctx: RouteCtx): ID {
  const { cash, voucher, env, freeOf, debt, blocked, cards, liquidityOrder } = ctx
  if (
    m.paidWith &&
    (cash.has(m.paidWith) || voucher.has(m.paidWith) || env.has(m.paidWith) || debt.has(m.paidWith))
  )
    return m.paidWith

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
      if (freeOf(id) - x >= 0) return id
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
  voucherAccounts: VoucherAccount[] = [],
  envelopes: Envelope[] = [],
): LedgerPoint[] {
  const ordered = sortMovements(movements.filter((m) => m.included))
  const cards = [...creditCards].sort((a, b) => a.position - b.position)
  const debits = [...debitAccounts].sort((a, b) => a.position - b.position)

  const cash = new Map<ID, Cents>([[LIQUID, 0], ...debits.map((d) => [d.id, 0] as const)])
  const voucher = new Map<ID, Cents>(voucherAccounts.map((v) => [v.id, 0] as const))
  // apartados: solo los que cuelgan de una cuenta de liquidez existente
  const env = new Map<ID, Cents>()
  const envAcct = new Map<ID, ID>()
  for (const e of envelopes) {
    if (!cash.has(e.accountId)) continue
    env.set(e.id, 0)
    envAcct.set(e.id, e.accountId)
  }
  const reservedOf = (acct: ID): Cents => {
    let r = 0
    for (const [id, a] of envAcct) if (a === acct) r += env.get(id) ?? 0
    return r
  }
  const freeOf = (acct: ID): Cents => (cash.get(acct) ?? 0) - reservedOf(acct)
  const totalReserved = (): Cents => {
    let t = 0
    for (const v of env.values()) t += v
    return t
  }
  const totalFree = (): Cents => {
    let t = 0
    for (const v of cash.values()) t += v
    return t - totalReserved()
  }
  /** resuelve un id de origen/destino a (cuenta de liquidez, apartado?) */
  const endpoint = (id: ID): { acct: ID; env?: ID } => {
    if (cash.has(id)) return { acct: id }
    const owner = envAcct.get(id)
    if (owner) return { acct: owner, env: id }
    return { acct: LIQUID }
  }

  const debt = new Map<ID, Cents>()
  const blocked = new Map<ID, boolean>()
  for (const c of cards) {
    debt.set(c.id, 0)
    blocked.set(c.id, false) // todas encendidas al inicio; los eventos las apagan/encienden
  }
  for (const d of debits) blocked.set(d.id, false)

  const liquidityOrder: ID[] = [LIQUID, ...debits.map((d) => d.id)]
  const ctx: RouteCtx = { cash, voucher, env, envAcct, freeOf, debt, blocked, cards, liquidityOrder }

  const points: LedgerPoint[] = []
  for (const m of ordered) {
    const before = totalFree()
    let paidFrom: ID | undefined
    let charged: ID | undefined
    let transferredTo: ID | undefined
    let envelopeId: ID | undefined

    if (m.cardBlock) {
      // evento: enciende/apaga una cuenta (débito o crédito) a partir de aquí
      blocked.set(m.cardBlock.cardId, m.cardBlock.blocked)
    } else if (m.kind === 'anchor') {
      // fija el saldo REAL de una cuenta (efectivo default, un débito, vales, un apartado o una tarjeta)
      const acct = m.accountId ?? LIQUID
      if (cash.has(acct)) cash.set(acct, m.amount)
      else if (voucher.has(acct)) voucher.set(acct, m.amount)
      else if (env.has(acct)) env.set(acct, m.amount)
      else debt.set(acct, m.amount)
    } else if (m.transfer) {
      // traspaso entre cuentas de liquidez y/o apartados; el líquido TOTAL no cambia
      const amt = Math.abs(m.amount)
      const src = endpoint(m.transfer.fromId)
      const dst = endpoint(m.transfer.toId)
      if (src.acct !== dst.acct) {
        cash.set(src.acct, (cash.get(src.acct) ?? 0) - amt)
        cash.set(dst.acct, (cash.get(dst.acct) ?? 0) + amt)
      }
      if (src.env !== dst.env) {
        if (src.env) env.set(src.env, (env.get(src.env) ?? 0) - amt)
        if (dst.env) env.set(dst.env, (env.get(dst.env) ?? 0) + amt)
      }
      paidFrom = src.acct
      transferredTo = dst.acct
      envelopeId = dst.env ?? src.env
    } else if (m.payCardId) {
      // pago a tarjeta: sale de una cuenta de liquidez (o de un apartado) y abona a la deuda
      const src = m.paidWith ? endpoint(m.paidWith) : { acct: LIQUID }
      cash.set(src.acct, (cash.get(src.acct) ?? 0) + m.amount) // amount es negativo
      if (src.env) env.set(src.env, (env.get(src.env) ?? 0) + m.amount)
      debt.set(m.payCardId, Math.max(0, (debt.get(m.payCardId) ?? 0) + m.amount))
      paidFrom = src.acct
      envelopeId = src.env
    } else if (m.amount >= 0) {
      // ingreso: entra a la cuenta elegida (efectivo default), a un apartado o a una carga de vales
      if (m.paidWith && voucher.has(m.paidWith)) {
        voucher.set(m.paidWith, (voucher.get(m.paidWith) ?? 0) + m.amount)
        paidFrom = m.paidWith
      } else {
        const dest = m.paidWith ? endpoint(m.paidWith) : { acct: LIQUID }
        cash.set(dest.acct, (cash.get(dest.acct) ?? 0) + m.amount)
        if (dest.env) env.set(dest.env, (env.get(dest.env) ?? 0) + m.amount)
        paidFrom = dest.acct
        envelopeId = dest.env
      }
    } else {
      // gasto: ruteo por prioridad (solo dinero libre) u override manual
      const x = -m.amount
      const target = routeExpense(m, x, ctx)
      if (cash.has(target)) cash.set(target, (cash.get(target) ?? 0) - x)
      else if (voucher.has(target)) voucher.set(target, (voucher.get(target) ?? 0) - x)
      else if (env.has(target)) {
        // sale del apartado: baja el apartado Y la cuenta dueña (el libre no cambia)
        const acct = envAcct.get(target)!
        cash.set(acct, (cash.get(acct) ?? 0) - x)
        env.set(target, (env.get(target) ?? 0) - x)
        envelopeId = target
      } else {
        debt.set(target, (debt.get(target) ?? 0) + x)
        charged = target
      }
      paidFrom = env.has(target) ? envAcct.get(target) : target
    }

    const freeAfter: Record<ID, Cents> = {}
    for (const id of cash.keys()) freeAfter[id] = freeOf(id)

    points.push({
      movement: m,
      balanceBefore: before,
      balanceAfter: totalFree(),
      reservedAfter: totalReserved(),
      isAnchor: m.kind === 'anchor',
      paidFrom,
      chargedToCardId: charged,
      transferredTo,
      envelopeId,
      cashAfter: Object.fromEntries(cash),
      freeAfter,
      envelopeAfter: Object.fromEntries(env),
      voucherAfter: Object.fromEntries(voucher),
      cardDebtAfter: Object.fromEntries(debt),
      cardBlockedAfter: Object.fromEntries(blocked),
    })
  }
  return points
}
