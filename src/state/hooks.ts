import { useMemo } from 'react'
import { usePlanStore } from './planStore'
import { buildComputedScenario } from '../domain/plan'
import type { ComputedScenario } from '../domain/types'

/** Escenario calculado (saldo líquido, semanas, tarjetas) recomputado del motor puro. */
export function useComputed(): ComputedScenario {
  const movements = usePlanStore((s) => s.movements)
  const recurrences = usePlanStore((s) => s.recurrences)
  const cards = usePlanStore((s) => s.creditCards)
  const debitAccounts = usePlanStore((s) => s.debitAccounts)
  const horizon = usePlanStore((s) => s.horizon)
  const scenarioId = usePlanStore((s) => s.activeScenarioId)
  return useMemo(
    () => buildComputedScenario({ scenarioId, movements, recurrences, cards, debitAccounts, horizon }),
    [scenarioId, movements, recurrences, cards, debitAccounts, horizon],
  )
}
