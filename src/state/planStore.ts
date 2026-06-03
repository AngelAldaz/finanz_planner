import { create } from 'zustand'
import type {
  Category,
  CreditCard,
  Horizon,
  ID,
  ISODate,
  Movement,
  Plan,
  Scenario,
  ScenarioRecurrence,
} from '../domain/types'
import { LIQUID } from '../domain/types'
import { repository, newId, nowISO } from '../data'
import { buildSeedBundle } from '../data/seed/seedData'
import { mondayOf } from '../domain/dates'
import { effectiveDate } from '../domain/ledger'

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

  init: () => Promise<void>
  selectScenario: (id: ID) => Promise<void>
  refresh: () => Promise<void>
  addMovement: (input: AddMovementInput) => Promise<void>
  updateMovement: (m: Movement) => Promise<void>
  deleteMovement: (id: ID) => Promise<void>
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
    })
    if (scenario) await get().selectScenario(scenario.id)
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
      included: true,
      source: { kind: 'manual' },
      order,
    })
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
