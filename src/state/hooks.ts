import { useMemo } from 'react'
import { usePlanStore } from './planStore'
import { buildComputedScenario } from '../domain/plan'
import type { ComputedScenario } from '../domain/types'

/** Escenario calculado (saldo líquido, semanas, tarjetas) recomputado del motor puro. */
export function useComputed(): ComputedScenario {
  const movements = usePlanStore((s) => s.movements)
  const cards = usePlanStore((s) => s.creditCards)
  const debitAccounts = usePlanStore((s) => s.debitAccounts)
  const horizon = usePlanStore((s) => s.horizon)
  const scenarioId = usePlanStore((s) => s.activeScenarioId)
  // las recurrencias ya están MATERIALIZADas como movimientos → no se expanden en vivo aquí
  return useMemo(
    () => buildComputedScenario({ scenarioId, movements, cards, debitAccounts, horizon }),
    [scenarioId, movements, cards, debitAccounts, horizon],
  )
}
