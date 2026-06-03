import { useMemo } from 'react'
import { usePlanStore } from './planStore'
import { buildComputedScenario } from '../domain/plan'
import type { ComputedScenario } from '../domain/types'

/** Escenario calculado (saldo corriente, semanas, mínimos) recomputado del motor puro. */
export function useComputed(): ComputedScenario {
  const movements = usePlanStore((s) => s.movements)
  const recurrences = usePlanStore((s) => s.recurrences)
  const horizon = usePlanStore((s) => s.horizon)
  const scenarioId = usePlanStore((s) => s.activeScenarioId)
  return useMemo(
    () => buildComputedScenario({ scenarioId, movements, recurrences, horizon }),
    [scenarioId, movements, recurrences, horizon],
  )
}
