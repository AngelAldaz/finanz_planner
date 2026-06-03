import { describe, it, expect } from 'vitest'
import { compareScenarios, duplicateScenarioData } from '../../src/domain/scenarios'
import { buildComputedScenario } from '../../src/domain/plan'
import { buildSeedMovements, SEED_HORIZON } from '../../src/data/seed/seedData'
import type { Scenario } from '../../src/domain/types'

describe('duplicar escenario', () => {
  it('copia con IDs nuevos e independiente del original', () => {
    const scenario: Scenario = {
      id: 's1',
      planId: 'p',
      name: 'Realista',
      position: 0,
      createdAt: 't',
      updatedAt: 't',
    }
    const movements = buildSeedMovements('s1')
    let n = 0
    const dup = duplicateScenarioData(
      { scenario, movements, recurrences: [] },
      'Optimista',
      () => `dup-${n++}`,
      't2',
    )
    expect(dup.scenario.id).not.toBe('s1')
    expect(dup.scenario.name).toBe('Optimista')
    expect(dup.movements.every((m) => m.scenarioId === dup.scenario.id)).toBe(true)
    expect(dup.movements.every((m) => !m.id.startsWith('seed-m-'))).toBe(true)

    // editar la copia NO toca el original
    dup.movements[1].amount = 999999
    expect(movements[1].amount).not.toBe(999999)
  })
})

describe('comparar escenarios', () => {
  it('detecta diferencias por semana', () => {
    const base = buildComputedScenario({
      scenarioId: 'a',
      movements: buildSeedMovements('a'),
      horizon: SEED_HORIZON,
    })
    const variantMovs = buildSeedMovements('b')
    variantMovs[10].amount += 100000 // Rubén +$1,000 (en centavos) en la semana 1
    const variant = buildComputedScenario({
      scenarioId: 'b',
      movements: variantMovs,
      horizon: SEED_HORIZON,
    })

    const cmp = compareScenarios(base, variant)
    const w1 = cmp.rows.find((r) => r.week.weekStart === '2026-05-25')!
    expect(w1.differs).toBe(true)
    expect(w1.delta).toBe(100000)
    expect(cmp.rows.length).toBe(6)
  })
})
