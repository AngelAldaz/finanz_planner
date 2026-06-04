import { create } from 'zustand'
import type {
  Category,
  Cents,
  CreditCard,
  Horizon,
  ID,
  ISODate,
  Movement,
  Plan,
  RecurrenceRule,
  Scenario,
  ScenarioRecurrence,
} from '../domain/types'
import { LIQUID } from '../domain/types'
import { repository, newId, nowISO } from '../data'
import { buildSeedBundle } from '../data/seed/seedData'
import { mondayOf } from '../domain/dates'
import { effectiveDate } from '../domain/ledger'
import { expandRecurrence } from '../domain/recurrence'

const DEFAULT_HORIZON: Horizon = { start: '2026-05-25', end: '2026-07-05' }
const CARD_COLORS = ['#2e5bff', '#ff3b30', '#0e9f6e', '#9b51e0', '#e8923c', '#00a3a3']

export interface AddMovementInput {
  name: string
  amount: number // centavos (con signo para delta; absoluto para anchor)
  kind: Movement['kind']
  date?: ISODate
  weekStart?: ISODate
  categoryId?: ID
  creditEligible?: boolean
  payCardId?: ID
  cardBlock?: { cardId: ID; blocked: boolean }
}

interface PlanState {
  ready: boolean
  plans: Plan[]
  scenarios: Scenario[]
  categories: Category[]
  creditCards: CreditCard[]
  activePlanId?: ID
  activeScenarioId?: ID
  movements: Movement[]
  recurrences: ScenarioRecurrence[]
  horizon: Horizon
  lowBalanceThreshold: Cents

  init: () => Promise<void>
  setLowBalanceThreshold: (cents: number) => Promise<void>
  selectScenario: (id: ID) => Promise<void>
  refresh: () => Promise<void>
  addMovement: (input: AddMovementInput) => Promise<void>
  addRecurring: (input: {
    name: string
    amount: number
    categoryId?: ID
    rule: RecurrenceRule
  }) => Promise<void>
  updateMovement: (m: Movement) => Promise<void>
  deleteMovement: (id: ID) => Promise<void>
  /** Borra una ocurrencia y todas las siguientes de su misma serie (mismo ruleId). */
  deleteSeriesFrom: (movement: Movement) => Promise<void>
  toggleIncluded: (id: ID) => Promise<void>
  setRealBalance: (weekStart: ISODate, amount: number, name?: string, accountId?: ID) => Promise<void>
  duplicateActiveScenario: (name: string) => Promise<void>
  deleteScenario: (id: ID) => Promise<void>
  addCard: (name: string, limit: number) => Promise<void>
  updateCard: (card: CreditCard) => Promise<void>
  deleteCard: (id: ID) => Promise<void>
}

export const usePlanStore = create<PlanState>((set, get) => ({
  ready: false,
  plans: [],
  scenarios: [],
  categories: [],
  creditCards: [],
  movements: [],
  recurrences: [],
  horizon: DEFAULT_HORIZON,
  lowBalanceThreshold: 0,

  init: async () => {
    if (await repository.isEmpty()) {
      await repository.importAll(buildSeedBundle(nowISO()))
    }
    const plans = await repository.listPlans()
    const plan = plans[0]
    const [scenarios, categories, creditCards] = await Promise.all([
      plan ? repository.listScenarios(plan.id) : Promise.resolve([]),
      repository.listCategories(),
      repository.listCreditCards(),
    ])
    const scenario = scenarios[0]
    set({
      ready: true,
      plans,
      scenarios,
      categories,
      creditCards,
      activePlanId: plan?.id,
      horizon: plan ? { start: plan.horizonStart, end: plan.horizonEnd } : DEFAULT_HORIZON,
      lowBalanceThreshold: plan?.lowBalanceThreshold ?? 0,
    })
    if (scenario) await get().selectScenario(scenario.id)
  },

  setLowBalanceThreshold: async (cents) => {
    const { plans, activePlanId } = get()
    set({ lowBalanceThreshold: cents })
    const plan = plans.find((p) => p.id === activePlanId)
    if (plan) {
      const updated = { ...plan, lowBalanceThreshold: cents, updatedAt: nowISO() }
      await repository.updatePlan(updated)
      set({ plans: plans.map((p) => (p.id === plan.id ? updated : p)) })
    }
  },

  selectScenario: async (id) => {
    const [movements, recurrences] = await Promise.all([
      repository.listMovements(id),
      repository.listRecurrences(id),
    ])
    set({ activeScenarioId: id, movements, recurrences })
  },

  refresh: async () => {
    const id = get().activeScenarioId
    if (!id) return
    const [movements, recurrences] = await Promise.all([
      repository.listMovements(id),
      repository.listRecurrences(id),
    ])
    set({ movements, recurrences })
  },

  addMovement: async (input) => {
    const { activeScenarioId, movements } = get()
    if (!activeScenarioId) return
    const order = movements.length ? Math.max(...movements.map((m) => m.order)) + 1 : 0
    await repository.putMovement({
      id: newId(),
      scenarioId: activeScenarioId,
      kind: input.kind,
      name: input.name,
      amount: input.amount,
      date: input.date,
      weekStart: input.weekStart ?? (input.date ? mondayOf(input.date) : undefined),
      categoryId: input.categoryId,
      creditEligible: input.creditEligible,
      payCardId: input.payCardId,
      cardBlock: input.cardBlock,
      included: true,
      source: { kind: 'manual' },
      order,
    })
    await get().refresh()
  },

  addRecurring: async ({ name, amount, categoryId, rule }) => {
    const { activeScenarioId, movements, horizon } = get()
    if (!activeScenarioId) return
    const baseOrder = movements.length ? Math.max(...movements.map((m) => m.order)) + 1 : 0
    const rec: ScenarioRecurrence = {
      id: newId(),
      scenarioId: activeScenarioId,
      name,
      amount,
      categoryId,
      rule,
      included: true,
    }
    // materializa cada ocurrencia como un movimiento real y editable
    const generated = expandRecurrence(rec, horizon).map((m, i) => ({ ...m, order: baseOrder + i }))
    if (generated.length) await repository.bulkPutMovements(generated)
    await get().refresh()
  },

  updateMovement: async (m) => {
    await repository.putMovement(m)
    await get().refresh()
  },

  deleteMovement: async (id) => {
    await repository.deleteMovement(id)
    await get().refresh()
  },

  deleteSeriesFrom: async (movement) => {
    const ruleId = movement.source?.ruleId
    if (!ruleId) {
      await get().deleteMovement(movement.id)
      return
    }
    const from = effectiveDate(movement)
    const toDelete = get().movements.filter(
      (m) => m.source?.ruleId === ruleId && effectiveDate(m) >= from,
    )
    await Promise.all(toDelete.map((m) => repository.deleteMovement(m.id)))
    await get().refresh()
  },

  toggleIncluded: async (id) => {
    const m = get().movements.find((x) => x.id === id)
    if (!m) return
    await repository.putMovement({ ...m, included: !m.included })
    await get().refresh()
  },

  setRealBalance: async (weekStart, amount, name, accountId = LIQUID) => {
    const { activeScenarioId, movements } = get()
    if (!activeScenarioId) return
    const weekMovs = movements
      .filter((m) => mondayOf(effectiveDate(m)) === weekStart)
      .sort((a, b) => a.order - b.order)
    const storedAccount = accountId === LIQUID ? undefined : accountId
    const existing = weekMovs.find(
      (m) => m.kind === 'anchor' && (m.accountId ?? LIQUID) === accountId,
    )
    if (existing) {
      await repository.putMovement({
        ...existing,
        amount,
        name: name ?? existing.name,
        kind: 'anchor',
        accountId: storedAccount,
        date: undefined,
        weekStart,
      })
    } else {
      const minOrder = weekMovs.length ? Math.min(...weekMovs.map((m) => m.order)) : 0
      await repository.putMovement({
        id: newId(),
        scenarioId: activeScenarioId,
        kind: 'anchor',
        name: name ?? 'Saldo real',
        amount,
        accountId: storedAccount,
        weekStart,
        included: true,
        source: { kind: 'manual' },
        order: minOrder - 1, // siempre primero en la semana
      })
    }
    await get().refresh()
  },

  duplicateActiveScenario: async (name) => {
    const { activeScenarioId, activePlanId } = get()
    if (!activeScenarioId || !activePlanId) return
    const id = await repository.duplicateScenario(activeScenarioId, name)
    set({ scenarios: await repository.listScenarios(activePlanId) })
    await get().selectScenario(id)
  },

  deleteScenario: async (id) => {
    const { activePlanId, activeScenarioId, scenarios } = get()
    if (!activePlanId || scenarios.length <= 1) return // nunca borrar el último
    await repository.deleteScenario(id)
    const remaining = await repository.listScenarios(activePlanId)
    set({ scenarios: remaining })
    if (activeScenarioId === id && remaining[0]) await get().selectScenario(remaining[0].id)
  },

  addCard: async (name, limit) => {
    const { creditCards } = get()
    await repository.putCreditCard({
      id: newId(),
      name,
      limit,
      color: CARD_COLORS[creditCards.length % CARD_COLORS.length],
      position: creditCards.length,
    })
    set({ creditCards: await repository.listCreditCards() })
  },

  updateCard: async (card) => {
    await repository.putCreditCard(card)
    set({ creditCards: await repository.listCreditCards() })
  },

  deleteCard: async (id) => {
    await repository.deleteCreditCard(id)
    set({ creditCards: await repository.listCreditCards() })
  },
}))
