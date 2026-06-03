import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import { FinanzDB } from '../../src/data/dexie/db'
import { DexiePlanRepository } from '../../src/data/dexie/DexiePlanRepository'
import { buildSeedBundle } from '../../src/data/seed/seedData'
import { nowISO } from '../../src/data/ids'

let counter = 0
function freshRepo() {
  // base de datos única por test para aislarlos
  return new DexiePlanRepository(new FinanzDB(`test-${counter++}`))
}

describe('DexiePlanRepository', () => {
  it('importa la semilla y lista plan / escenario / 47 movimientos', async () => {
    const repo = freshRepo()
    expect(await repo.isEmpty()).toBe(true)
    await repo.importAll(buildSeedBundle(nowISO()))
    expect(await repo.isEmpty()).toBe(false)

    const plans = await repo.listPlans()
    expect(plans.length).toBe(1)
    const scenarios = await repo.listScenarios(plans[0].id)
    expect(scenarios.length).toBe(1)
    const movs = await repo.listMovements(scenarios[0].id)
    expect(movs.length).toBe(47)
  })

  it('duplica un escenario con copia independiente', async () => {
    const repo = freshRepo()
    await repo.importAll(buildSeedBundle(nowISO()))
    const [plan] = await repo.listPlans()
    const [scenario] = await repo.listScenarios(plan.id)

    const dupId = await repo.duplicateScenario(scenario.id, 'Optimista')
    expect((await repo.listScenarios(plan.id)).length).toBe(2)

    const dupMovs = await repo.listMovements(dupId)
    expect(dupMovs.length).toBe(47)
    // los IDs de la copia son nuevos (no chocan con el original)
    expect(dupMovs.every((m) => !m.id.startsWith('seed-m-'))).toBe(true)

    // editar la copia no toca el original
    await repo.putMovement({ ...dupMovs[0], amount: 123 })
    const orig = await repo.listMovements(scenario.id)
    expect(orig.find((m) => m.id === dupMovs[0].id)).toBeUndefined()
  })

  it('round-trip export → import preserva los datos', async () => {
    const repo = freshRepo()
    await repo.importAll(buildSeedBundle(nowISO()))
    const bundle = await repo.exportAll()

    const repo2 = freshRepo()
    await repo2.importAll(bundle)
    const [plan] = await repo2.listPlans()
    const [scenario] = await repo2.listScenarios(plan.id)
    expect((await repo2.listMovements(scenario.id)).length).toBe(47)
    expect((await repo2.listCatalogItems('debt')).length).toBe(3)
  })
})
