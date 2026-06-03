// Orquestador: arma el escenario calculado a partir de movimientos + recurrencias + tarjetas.
import type {
  CardState,
  ComputedScenario,
  CreditCard,
  Horizon,
  ID,
  ISODate,
  Movement,
  ScenarioRecurrence,
} from './types'
import { computeLedger, effectiveDate } from './ledger'
import { expandAllRecurrences } from './recurrence'
import { weekSummaries } from './weeks'

export interface ScenarioInput {
  scenarioId?: ID
  movements: Movement[]
  recurrences?: ScenarioRecurrence[]
  cards?: CreditCard[]
  horizon: Horizon
}

export function buildComputedScenario(input: ScenarioInput): ComputedScenario {
  const { movements, recurrences = [], cards = [], horizon } = input

  // las instancias generadas que el usuario ya editó (mismo occurrenceKey) ceden ante las manuales
  const manualKeys = new Set(
    movements.map((m) => m.source?.occurrenceKey).filter((k): k is string => !!k),
  )
  const generated = expandAllRecurrences(recurrences, horizon).filter(
    (g) => !manualKeys.has(g.source!.occurrenceKey!),
  )

  const points = computeLedger([...movements, ...generated], cards)
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
  }
}
