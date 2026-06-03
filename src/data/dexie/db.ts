import Dexie, { type Table } from 'dexie'
import type {
  CatalogItem,
  Category,
  CreditCard,
  Movement,
  Plan,
  Scenario,
  ScenarioRecurrence,
} from '../../domain/types'

export class FinanzDB extends Dexie {
  plans!: Table<Plan, string>
  scenarios!: Table<Scenario, string>
  movements!: Table<Movement, string>
  recurrences!: Table<ScenarioRecurrence, string>
  categories!: Table<Category, string>
  catalogItems!: Table<CatalogItem, string>
  creditCards!: Table<CreditCard, string>

  constructor(name = 'finanz') {
    super(name)
    this.version(1).stores({
      plans: 'id, updatedAt',
      scenarios: 'id, planId, position',
      movements: 'id, scenarioId, [scenarioId+order]',
      recurrences: 'id, scenarioId',
      categories: 'id',
      catalogItems: 'id, catalog',
    })
    this.version(2).stores({
      creditCards: 'id, position',
    })
  }
}

export const db = new FinanzDB()
