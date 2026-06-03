// Comparar y duplicar escenarios (parte pura; la persistencia la hace el repository).
import type {
  Cents,
  ComputedScenario,
  ID,
  Movement,
  Scenario,
  ScenarioComparison,
  ScenarioRecurrence,
  WeekKey,
} from './types'
import { compareISO } from './dates'

export function compareScenarios(a: ComputedScenario, b: ComputedScenario): ScenarioComparison {
  const byWeek = new Map<string, { week: WeekKey; a?: Cents; b?: Cents }>()
  for (const w of a.weeks) byWeek.set(w.key.weekStart, { week: w.key, a: w.closingBalance })
  for (const w of b.weeks) {
    const e = byWeek.get(w.key.weekStart)
    if (e) e.b = w.closingBalance
    else byWeek.set(w.key.weekStart, { week: w.key, b: w.closingBalance })
  }
  const rows = [...byWeek.values()]
    .sort((x, y) => compareISO(x.week.weekStart, y.week.weekStart))
    .map((e) => ({
      week: e.week,
      aClosing: e.a,
      bClosing: e.b,
      delta: e.a != null && e.b != null ? e.b - e.a : undefined,
      differs: (e.a ?? null) !== (e.b ?? null),
    }))
  return {
    aId: a.scenarioId,
    bId: b.scenarioId,
    rows,
    minBalanceDelta: b.minBalance - a.minBalance,
    firstNegativeDiffers: a.firstNegativeWeek?.weekStart !== b.firstNegativeWeek?.weekStart,
  }
}

export function duplicateScenarioData(
  src: { scenario: Scenario; movements: Movement[]; recurrences: ScenarioRecurrence[] },
  newName: string,
  newId: () => ID,
  now: string,
): { scenario: Scenario; movements: Movement[]; recurrences: ScenarioRecurrence[] } {
  const id = newId()
  const scenario: Scenario = {
    ...src.scenario,
    id,
    name: newName,
    position: src.scenario.position + 1,
    createdAt: now,
    updatedAt: now,
  }
  const movements = src.movements.map((m) => ({ ...m, id: newId(), scenarioId: id }))
  const recurrences = src.recurrences.map((r) => ({ ...r, id: newId(), scenarioId: id }))
  return { scenario, movements, recurrences }
}
