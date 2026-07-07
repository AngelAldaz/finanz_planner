// Orquestador: arma el escenario calculado a partir de movimientos + recurrencias + tarjetas.
import type {
  CardState,
  CashState,
  ComputedScenario,
  CreditCard,
  DebitAccount,
  Horizon,
  ID,
  ISODate,
  Movement,
  ScenarioRecurrence,
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
  horizon: Horizon
}

export function buildComputedScenario(input: ScenarioInput): ComputedScenario {
  const { movements, recurrences = [], cards = [], debitAccounts = [], horizon } = input

  // las instancias generadas que el usuario ya editó (mismo occurrenceKey) ceden ante las manuales
  const manualKeys = new Set(
    movements.map((m) => m.source?.occurrenceKey).filter((k): k is string => !!k),
  )
  const generated = expandAllRecurrences(recurrences, horizon).filter(
    (g) => !manualKeys.has(g.source!.occurrenceKey!),
  )

  const points = computeLedger([...movements, ...generated], cards, debitAccounts)
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

  const last = points.length ? points[points.length - 1] : undefined
  const cardStates: CardState[] = cards.map((c) => {
    const debt = last?.cardDebtAfter[c.id] ?? 0
    return { card: c, debt, available: c.limit - debt, blocked: last?.cardBlockedAfter[c.id] ?? false }
  })

  const orderedDebits = [...debitAccounts].sort((a, b) => a.position - b.position)
  const cashStates: CashState[] = [
    { id: LIQUID, name: EFECTIVO_NAME, kind: 'cash', balance: last?.cashAfter[LIQUID] ?? 0, blocked: false },
    ...orderedDebits.map((d) => ({
      id: d.id,
      name: d.name,
      kind: 'debit' as const,
      balance: last?.cashAfter[d.id] ?? 0,
      blocked: last?.cardBlockedAfter[d.id] ?? false,
    })),
  ]

  return {
    scenarioId: input.scenarioId ?? '',
    points,
    weeks,
    finalBalance: points.length ? points[points.length - 1].balanceAfter : 0,
    minBalance,
    minBalanceAt,
    firstNegativeWeek: firstNeg?.key,
    firstNegativeAt,
    cardStates,
    cashStates,
  }
}
