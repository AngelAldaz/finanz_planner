import Dexie, { type Table } from 'dexie'
import type {
  CatalogItem,
  Category,
  CreditCard,
  DebitAccount,
  Envelope,
  Movement,
  Plan,
  Scenario,
  ScenarioRecurrence,
  VoucherAccount,
} from '../../domain/types'

export class FinanzDB extends Dexie {
  plans!: Table<Plan, string>
  scenarios!: Table<Scenario, string>
  movements!: Table<Movement, string>
  recurrences!: Table<ScenarioRecurrence, string>
  categories!: Table<Category, string>
  catalogItems!: Table<CatalogItem, string>
  creditCards!: Table<CreditCard, string>
  debitAccounts!: Table<DebitAccount, string>
  voucherAccounts!: Table<VoucherAccount, string>
  envelopes!: Table<Envelope, string>

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
    this.version(3).stores({
      debitAccounts: 'id, position',
    })
    this.version(4).stores({
      voucherAccounts: 'id, position',
    })
    this.version(5).stores({
      envelopes: 'id, accountId, position',
    })
  }
}

export const db = new FinanzDB()
