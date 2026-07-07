import type { PlanRepository } from '../repository'
import type {
  BackupBundle,
  CatalogItem,
  CatalogKind,
  Category,
  CreditCard,
  DebitAccount,
  ID,
  Movement,
  Plan,
  Scenario,
  ScenarioRecurrence,
} from '../../domain/types'
import { duplicateScenarioData } from '../../domain/scenarios'
import { newId, nowISO } from '../ids'
import { db as defaultDb, FinanzDB } from './db'

export class DexiePlanRepository implements PlanRepository {
  private db: FinanzDB
  constructor(database: FinanzDB = defaultDb) {
    this.db = database
  }

  // ----- plans -----
  listPlans() {
    return this.db.plans.toArray()
  }
  getPlan(id: ID) {
    return this.db.plans.get(id)
  }
  async createPlan(p: Plan) {
    await this.db.plans.put(p)
  }
  async updatePlan(p: Plan) {
    await this.db.plans.put(p)
  }
  async deletePlan(id: ID) {
    await this.db.transaction(
      'rw',
      this.db.plans,
      this.db.scenarios,
      this.db.movements,
      this.db.recurrences,
      async () => {
        const sids = (await this.db.scenarios.where('planId').equals(id).toArray()).map((s) => s.id)
        await this.db.movements.where('scenarioId').anyOf(sids).delete()
        await this.db.recurrences.where('scenarioId').anyOf(sids).delete()
        await this.db.scenarios.where('planId').equals(id).delete()
        await this.db.plans.delete(id)
      },
    )
  }

  // ----- scenarios -----
  listScenarios(planId: ID) {
    return this.db.scenarios.where('planId').equals(planId).sortBy('position')
  }
  getScenario(id: ID) {
    return this.db.scenarios.get(id)
  }
  async createScenario(s: Scenario) {
    await this.db.scenarios.put(s)
  }
  async updateScenario(s: Scenario) {
    await this.db.scenarios.put(s)
  }
  async deleteScenario(id: ID) {
    await this.db.transaction(
      'rw',
      this.db.scenarios,
      this.db.movements,
      this.db.recurrences,
      async () => {
        await this.db.movements.where('scenarioId').equals(id).delete()
        await this.db.recurrences.where('scenarioId').equals(id).delete()
        await this.db.scenarios.delete(id)
      },
    )
  }
  async duplicateScenario(srcScenarioId: ID, newName: string) {
    const scenario = await this.db.scenarios.get(srcScenarioId)
    if (!scenario) throw new Error(`Escenario no encontrado: ${srcScenarioId}`)
    const [movements, recurrences] = await Promise.all([
      this.db.movements.where('scenarioId').equals(srcScenarioId).toArray(),
      this.db.recurrences.where('scenarioId').equals(srcScenarioId).toArray(),
    ])
    const dup = duplicateScenarioData({ scenario, movements, recurrences }, newName, newId, nowISO())
    await this.db.transaction(
      'rw',
      this.db.scenarios,
      this.db.movements,
      this.db.recurrences,
      async () => {
        await this.db.scenarios.put(dup.scenario)
        if (dup.movements.length) await this.db.movements.bulkPut(dup.movements)
        if (dup.recurrences.length) await this.db.recurrences.bulkPut(dup.recurrences)
      },
    )
    return dup.scenario.id
  }

  // ----- movements -----
  listMovements(scenarioId: ID) {
    return this.db.movements.where('scenarioId').equals(scenarioId).toArray()
  }
  async putMovement(m: Movement) {
    await this.db.movements.put(m)
  }
  async bulkPutMovements(ms: Movement[]) {
    await this.db.movements.bulkPut(ms)
  }
  async deleteMovement(id: ID) {
    await this.db.movements.delete(id)
  }

  // ----- recurrences -----
  listRecurrences(scenarioId: ID) {
    return this.db.recurrences.where('scenarioId').equals(scenarioId).toArray()
  }
  async putRecurrence(r: ScenarioRecurrence) {
    await this.db.recurrences.put(r)
  }
  async deleteRecurrence(id: ID) {
    await this.db.recurrences.delete(id)
  }

  // ----- categories -----
  listCategories() {
    return this.db.categories.toArray()
  }
  async putCategory(c: Category) {
    await this.db.categories.put(c)
  }
  async deleteCategory(id: ID) {
    await this.db.categories.delete(id)
  }

  // ----- catalogs -----
  listCatalogItems(catalog?: CatalogKind) {
    return catalog
      ? this.db.catalogItems.where('catalog').equals(catalog).toArray()
      : this.db.catalogItems.toArray()
  }
  async putCatalogItem(i: CatalogItem) {
    await this.db.catalogItems.put(i)
  }
  async deleteCatalogItem(id: ID) {
    await this.db.catalogItems.delete(id)
  }

  // ----- credit cards -----
  listCreditCards() {
    return this.db.creditCards.orderBy('position').toArray()
  }
  async putCreditCard(c: CreditCard) {
    await this.db.creditCards.put(c)
  }
  async deleteCreditCard(id: ID) {
    await this.db.creditCards.delete(id)
  }

  // ----- debit accounts -----
  listDebitAccounts() {
    return this.db.debitAccounts.orderBy('position').toArray()
  }
  async putDebitAccount(a: DebitAccount) {
    await this.db.debitAccounts.put(a)
  }
  async deleteDebitAccount(id: ID) {
    await this.db.debitAccounts.delete(id)
  }

  // ----- bulk / sync seam -----
  async isEmpty() {
    return (await this.db.plans.count()) === 0
  }
  async exportAll(): Promise<BackupBundle> {
    const [plans, scenarios, movements, recurrences, categories, catalogItems, creditCards, debitAccounts] =
      await Promise.all([
        this.db.plans.toArray(),
        this.db.scenarios.toArray(),
        this.db.movements.toArray(),
        this.db.recurrences.toArray(),
        this.db.categories.toArray(),
        this.db.catalogItems.toArray(),
        this.db.creditCards.toArray(),
        this.db.debitAccounts.toArray(),
      ])
    return {
      version: 1,
      plans,
      scenarios,
      movements,
      recurrences,
      categories,
      catalogItems,
      creditCards,
      debitAccounts,
    }
  }
  async importAll(bundle: BackupBundle) {
    await this.db.transaction('rw', this.db.tables, async () => {
      await Promise.all([
        this.db.plans.clear(),
        this.db.scenarios.clear(),
        this.db.movements.clear(),
        this.db.recurrences.clear(),
        this.db.categories.clear(),
        this.db.catalogItems.clear(),
        this.db.creditCards.clear(),
        this.db.debitAccounts.clear(),
      ])
      await Promise.all([
        this.db.plans.bulkPut(bundle.plans),
        this.db.scenarios.bulkPut(bundle.scenarios),
        this.db.movements.bulkPut(bundle.movements),
        this.db.recurrences.bulkPut(bundle.recurrences),
        this.db.categories.bulkPut(bundle.categories),
        this.db.catalogItems.bulkPut(bundle.catalogItems),
        this.db.creditCards.bulkPut(bundle.creditCards ?? []),
        this.db.debitAccounts.bulkPut(bundle.debitAccounts ?? []),
      ])
    })
  }
}
