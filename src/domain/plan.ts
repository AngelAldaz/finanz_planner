// Orquestador: arma el escenario calculado a partir de movimientos + recurrencias + tarjetas.
import type {
  CardState,
  CashState,
  ComputedScenario,
  CreditCard,
  DebitAccount,
  Envelope,
  EnvelopeState,
  Horizon,
  ID,
  ISODate,
  LedgerPoint,
  Movement,
  ScenarioRecurrence,
  VoucherAccount,
} from './types'
import { EFECTIVO_NAME, LIQUID } from './types'
import { computeLedger, effectiveDate } from './ledger'
import { expandAllRecurrences } from './recurrence'
import { weekSummaries } from './weeks'

export interface ScenarioInput {
  scenarioId?: ID
  movements: Movement[]
  recurrences?: ScenarioRecurrence[]
  cards?: CreditCard[]
  debitAccounts?: DebitAccount[]
  voucherAccounts?: VoucherAccount[]
  envelopes?: Envelope[]
  horizon: Horizon
  today?: ISODate // para los saldos "a día de hoy" (default: estado final)
}

export function buildComputedScenario(input: ScenarioInput): ComputedScenario {
  const {
    movements,
    recurrences = [],
    cards = [],
    debitAccounts = [],
    voucherAccounts = [],
    envelopes = [],
    horizon,
    today,
  } = input

  // las instancias generadas que el usuario ya editó (mismo occurrenceKey) ceden ante las manuales
  const manualKeys = new Set(
    movements.map((m) => m.source?.occurrenceKey).filter((k): k is string => !!k),
  )
  const generated = expandAllRecurrences(recurrences, horizon).filter(
    (g) => !manualKeys.has(g.source!.occurrenceKey!),
  )

  const points = computeLedger(
    [...movements, ...generated],
    cards,
    debitAccounts,
    voucherAccounts,
    envelopes,
  )
  const weeks = weekSummaries(points)

  let minBalance = points.length ? points[0].balanceAfter : 0
  let minBalanceAt: ISODate | undefined = points.length
    ? effectiveDate(points[0].movement)
    : undefined
  for (const p of points) {
    if (p.balanceAfter < minBalance) {
      minBalance = p.balanceAfter
      minBalanceAt = effectiveDate(p.movement)
    }
  }

  const firstNeg = weeks.find((w) => w.goesNegative)
  let firstNegativeAt: ISODate | undefined
  if (firstNeg) {
    const p = firstNeg.points.find((pt) => pt.balanceAfter < 0)
    firstNegativeAt = p ? effectiveDate(p.movement) : undefined
  }

  const orderedDebits = [...debitAccounts].sort((a, b) => a.position - b.position)
  const orderedVouchers = [...voucherAccounts].sort((a, b) => a.position - b.position)
  const orderedEnvelopes = [...envelopes].sort((a, b) => a.position - b.position)
  const statesAt = (snap: LedgerPoint | undefined) => {
    const cardStates: CardState[] = cards.map((c) => {
      const debt = snap?.cardDebtAfter[c.id] ?? 0
      return { card: c, debt, available: c.limit - debt, blocked: snap?.cardBlockedAfter[c.id] ?? false }
    })
    const liq = (id: ID) => {
      const balance = snap?.cashAfter[id] ?? 0
      const free = snap?.freeAfter[id] ?? balance
      return { balance, free, reserved: balance - free }
    }
    const cashStates: CashState[] = [
      { id: LIQUID, name: EFECTIVO_NAME, kind: 'cash', ...liq(LIQUID), blocked: false },
      ...orderedDebits.map((d) => ({
        id: d.id,
        name: d.name,
        kind: 'debit' as const,
        ...liq(d.id),
        blocked: snap?.cardBlockedAfter[d.id] ?? false,
      })),
    ]
    const voucherStates: CashState[] = orderedVouchers.map((v) => {
      const balance = snap?.voucherAfter[v.id] ?? 0
      return { id: v.id, name: v.name, kind: 'voucher' as const, balance, free: balance, reserved: 0, blocked: false }
    })
    const envelopeStates: EnvelopeState[] = orderedEnvelopes.map((e) => ({
      envelope: e,
      balance: snap?.envelopeAfter[e.id] ?? 0,
    }))
    return { cardStates, cashStates, voucherStates, envelopeStates }
  }

  const last = points.length ? points[points.length - 1] : undefined
  const final = statesAt(last)

  // snapshot "a día de hoy": el último punto cuya fecha efectiva es <= hoy (los puntos van en orden)
  let todaySnap: LedgerPoint | undefined
  if (today) {
    for (const p of points) {
      if (effectiveDate(p.movement) <= today) todaySnap = p
      else break
    }
  } else {
    todaySnap = last
  }
  const todayStates = statesAt(todaySnap)

  return {
    scenarioId: input.scenarioId ?? '',
    points,
    weeks,
    finalBalance: last?.balanceAfter ?? 0,
    finalReserved: last?.reservedAfter ?? 0,
    minBalance,
    minBalanceAt,
    firstNegativeWeek: firstNeg?.key,
    firstNegativeAt,
    cardStates: final.cardStates,
    cashStates: final.cashStates,
    cardStatesToday: todayStates.cardStates,
    cashStatesToday: todayStates.cashStates,
    voucherStates: final.voucherStates,
    voucherStatesToday: todayStates.voucherStates,
    envelopeStates: final.envelopeStates,
    envelopeStatesToday: todayStates.envelopeStates,
  }
}
