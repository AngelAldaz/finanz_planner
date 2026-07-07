import { create } from 'zustand'
import type {
  Category,
  Cents,
  CreditCard,
  DebitAccount,
  Horizon,
  ID,
  ISODate,
  Movement,
  Plan,
  RecurrenceRule,
  Scenario,
  ScenarioRecurrence,
} from '../domain/types'
import { EFECTIVO_NAME, LIQUID } from '../domain/types'
import { repository, newId, nowISO } from '../data'
import { buildEmptyBundle, buildSeedBundle } from '../data/seed/seedData'
import { addDays, mondayOf } from '../domain/dates'
import { effectiveDate } from '../domain/ledger'
import { expandRecurrence, inferRuleFromDates } from '../domain/recurrence'

const DEFAULT_HORIZON: Horizon = { start: '2026-05-25', end: '2026-07-05' }
const CARD_COLORS = ['#2e5bff', '#ff3b30', '#0e9f6e', '#9b51e0', '#e8923c', '#00a3a3']

// El plan es ABIERTO: el fin se calcula solo y se extiende según tu contenido (semana tras semana).
const BUFFER_WEEKS = 26 // colchón de semanas futuras siempre disponibles
const MATERIALIZE_WEEKS = 156 // ~3 años de recurrencias SIEMPRE materializadas por delante
const maxISO = (a: ISODate, b: ISODate): ISODate => (a > b ? a : b)

function todayISO(): ISODate {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayMondayISO(): ISODate {
  return mondayOf(todayISO())
}
/** Hasta dónde se materializan las recurrencias (rueda con el tiempo real). */
function materializeEnd(): ISODate {
  return addDays(todayMondayISO(), 7 * MATERIALIZE_WEEKS)
}

/** Extiende (materializa) la cola de cada recurrencia hasta `materializeEnd()`.
 *  Repara series viejas sin regla (infiere) solo si siguen vivas (última ocurrencia futura). */
async function topUpRecurrences(scenarioId: ID, movements: Movement[]): Promise<boolean> {
  const groups = new Map<ID, Movement[]>()
  for (const m of movements) {
    const rid = m.source?.ruleId
    if (!rid) continue
    const arr = groups.get(rid)
    if (arr) arr.push(m)
    else groups.set(rid, [m])
  }
  if (groups.size === 0) return false

  const rules = await repository.listRecurrences(scenarioId)
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const end = materializeEnd()
  const today = todayISO()
  const toAdd: Movement[] = []
  let baseOrder = movements.length ? Math.max(...movements.map((m) => m.order)) + 1 : 0

  for (const [rid, occs] of groups) {
    let rule = ruleById.get(rid)
    if (!rule) {
      const sorted = [...occs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
      const last = sorted[sorted.length - 1]
      const lastDate = last.date ?? last.weekStart ?? ''
      if (lastDate < today) continue // serie ya terminada en el pasado → no la revivas
      const inferred = inferRuleFromDates(sorted.map((m) => m.date ?? m.weekStart ?? ''))
      if (!inferred) continue
      const proto = sorted[0]
      rule = {
        id: rid,
        scenarioId,
        name: proto.name,
        amount: proto.amount,
        categoryId: proto.categoryId,
        cashEligible: proto.cashEligible,
        debitEligible: proto.debitEligible,
        creditEligible: proto.creditEligible,
        paidWith: proto.paidWith,
        rule: inferred,
        included: true,
      }
      await repository.putRecurrence(rule)
    }
    const existingKeys = new Set(occs.map((m) => m.source?.occurrenceKey))
    const maxDate = occs.reduce((a, m) => {
      const d = m.date ?? m.weekStart ?? ''
      return d > a ? d : a
    }, '')
    for (const gmv of expandRecurrence(rule, { start: rule.rule.startDate, end })) {
      const key = gmv.source?.occurrenceKey
      const gd = gmv.date ?? ''
      if (key && !existingKeys.has(key) && gd > maxDate) toAdd.push({ ...gmv, order: baseOrder++ })
    }
  }
  if (toAdd.length) {
    await repository.bulkPutMovements(toAdd)
    return true
  }
  return false
}

function dynamicHorizon(plan: Plan | undefined, movements: Movement[]): Horizon {
  const todayMon = todayMondayISO()
  const dates = movements.map((m) => m.date ?? m.weekStart).filter((x): x is string => !!x)
  const latest = dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : todayMon
  const end = addDays(maxISO(mondayOf(latest), todayMon), 7 * BUFFER_WEEKS)
  return { start: plan ? mondayOf(plan.horizonStart) : todayMon, end }
}

export interface AddMovementInput {
  name: string
  amount: number // centavos (con signo para delta; absoluto para anchor)
  kind: Movement['kind']
  date?: ISODate
  weekStart?: ISODate
  categoryId?: ID
  cashEligible?: boolean
  debitEligible?: boolean
  creditEligible?: boolean
  paidWith?: ID
  accountId?: ID
  payCardId?: ID
  cardBlock?: { cardId: ID; blocked: boolean }
}

/** Nombre a mostrar de una cuenta (efectivo / débito / crédito). */
function accountLabel(
  s: { debitAccounts: DebitAccount[]; creditCards: CreditCard[] },
  accountId: ID,
): string {
  if (accountId === LIQUID) return EFECTIVO_NAME
  return (
    s.debitAccounts.find((d) => d.id === accountId)?.name ??
    s.creditCards.find((c) => c.id === accountId)?.name ??
    'Saldo real'
  )
}

interface PlanState {
  ready: boolean
  plans: Plan[]
  scenarios: Scenario[]
  categories: Category[]
  creditCards: CreditCard[]
  debitAccounts: DebitAccount[]
  activePlanId?: ID
  activeScenarioId?: ID
  movements: Movement[]
  recurrences: ScenarioRecurrence[]
  horizon: Horizon
  lowBalanceThreshold: Cents

  init: () => Promise<void>
  resetAll: () => Promise<void>
  setLowBalanceThreshold: (cents: number) => Promise<void>
  setPlanName: (name: string) => Promise<void>
  setHorizon: (start: ISODate, end: ISODate) => Promise<void>
  selectScenario: (id: ID) => Promise<void>
  refresh: () => Promise<void>
  addMovement: (input: AddMovementInput) => Promise<void>
  addRecurring: (input: {
    name: string
    amount: number
    categoryId?: ID
    cashEligible?: boolean
    debitEligible?: boolean
    creditEligible?: boolean
    paidWith?: ID
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
  renameScenario: (id: ID, name: string) => Promise<void>
  duplicateScenarioById: (id: ID, name: string) => Promise<void>
  addCard: (name: string, limit: number) => Promise<void>
  updateCard: (card: CreditCard) => Promise<void>
  deleteCard: (id: ID) => Promise<void>
  moveCard: (id: ID, dir: -1 | 1) => Promise<void>
  addDebitAccount: (name: string) => Promise<void>
  updateDebitAccount: (a: DebitAccount) => Promise<void>
  deleteDebitAccount: (id: ID) => Promise<void>
  moveDebitAccount: (id: ID, dir: -1 | 1) => Promise<void>
  addCategory: (name: string, color: string) => Promise<void>
  updateCategory: (cat: Category) => Promise<void>
  deleteCategory: (id: ID) => Promise<void>
}

export const usePlanStore = create<PlanState>((set, get) => ({
  ready: false,
  plans: [],
  scenarios: [],
  categories: [],
  creditCards: [],
  debitAccounts: [],
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
    const [scenarios, categories, creditCards, debitAccounts] = await Promise.all([
      plan ? repository.listScenarios(plan.id) : Promise.resolve([]),
      repository.listCategories(),
      repository.listCreditCards(),
      repository.listDebitAccounts(),
    ])
    const scenario = scenarios[0]
    set({
      ready: true,
      plans,
      scenarios,
      categories,
      creditCards,
      debitAccounts,
      activePlanId: plan?.id,
      horizon: dynamicHorizon(plan, []),
      lowBalanceThreshold: plan?.lowBalanceThreshold ?? 0,
    })
    if (scenario) await get().selectScenario(scenario.id)
  },

  resetAll: async () => {
    // borra todo lo local y deja un plan vacío
    await repository.importAll(buildEmptyBundle(nowISO()))
    await get().init()
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

  setPlanName: async (name) => {
    const { plans, activePlanId } = get()
    const plan = plans.find((p) => p.id === activePlanId)
    if (!plan) return
    const updated = { ...plan, name, updatedAt: nowISO() }
    await repository.updatePlan(updated)
    set({ plans: plans.map((p) => (p.id === plan.id ? updated : p)) })
  },

  setHorizon: async (start, end) => {
    const { plans, activePlanId } = get()
    const plan = plans.find((p) => p.id === activePlanId)
    if (!plan) return
    const updated = { ...plan, horizonStart: start, horizonEnd: end, updatedAt: nowISO() }
    await repository.updatePlan(updated)
    set({ plans: plans.map((p) => (p.id === plan.id ? updated : p)), horizon: { start, end } })
  },

  selectScenario: async (id) => {
    let [movements, recurrences] = await Promise.all([
      repository.listMovements(id),
      repository.listRecurrences(id),
    ])
    if (await topUpRecurrences(id, movements)) movements = await repository.listMovements(id)
    const plan = get().plans.find((p) => p.id === get().activePlanId)
    set({ activeScenarioId: id, movements, recurrences, horizon: dynamicHorizon(plan, movements) })
  },

  refresh: async () => {
    const id = get().activeScenarioId
    if (!id) return
    let [movements, recurrences] = await Promise.all([
      repository.listMovements(id),
      repository.listRecurrences(id),
    ])
    if (await topUpRecurrences(id, movements)) movements = await repository.listMovements(id)
    const plan = get().plans.find((p) => p.id === get().activePlanId)
    set({ movements, recurrences, horizon: dynamicHorizon(plan, movements) })
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
      cashEligible: input.cashEligible,
      debitEligible: input.debitEligible,
      creditEligible: input.creditEligible,
      paidWith: input.paidWith,
      accountId: input.accountId,
      payCardId: input.payCardId,
      cardBlock: input.cardBlock,
      included: true,
      source: { kind: 'manual' },
      order,
    })
    await get().refresh()
  },

  addRecurring: async ({
    name,
    amount,
    categoryId,
    cashEligible,
    debitEligible,
    creditEligible,
    paidWith,
    rule,
  }) => {
    const { activeScenarioId, movements } = get()
    if (!activeScenarioId) return
    const baseOrder = movements.length ? Math.max(...movements.map((m) => m.order)) + 1 : 0
    const rec: ScenarioRecurrence = {
      id: newId(),
      scenarioId: activeScenarioId,
      name,
      amount,
      categoryId,
      cashEligible,
      debitEligible,
      creditEligible,
      paidWith,
      rule,
      included: true,
    }
    // guarda la REGLA (para poder extender la serie luego) y materializa hasta el horizonte largo
    await repository.putRecurrence(rec)
    const recurHorizon: Horizon = { start: rule.startDate, end: materializeEnd() }
    const generated = expandRecurrence(rec, recurHorizon).map((m, i) => ({ ...m, order: baseOrder + i }))
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
    const scenarioId = get().activeScenarioId
    if (!ruleId || !scenarioId) {
      await get().deleteMovement(movement.id)
      return
    }
    const from = effectiveDate(movement)
    const endDate = addDays(from, -1)
    // termina la serie: pon endDate en la regla para que el top-up no vuelva a generarla
    const rules = await repository.listRecurrences(scenarioId)
    const rule = rules.find((r) => r.id === ruleId)
    if (rule) {
      await repository.putRecurrence({ ...rule, rule: { ...rule.rule, endDate } })
    } else {
      // serie vieja sin regla: crea una regla "terminada" a partir de lo materializado
      const occs = get().movements.filter((m) => m.source?.ruleId === ruleId)
      const inferred = inferRuleFromDates(occs.map((m) => m.date ?? m.weekStart ?? ''))
      if (inferred) {
        const proto = [...occs].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0]
        await repository.putRecurrence({
          id: ruleId,
          scenarioId,
          name: proto.name,
          amount: proto.amount,
          categoryId: proto.categoryId,
          cashEligible: proto.cashEligible,
          debitEligible: proto.debitEligible,
          creditEligible: proto.creditEligible,
          paidWith: proto.paidWith,
          rule: { ...inferred, endDate },
          included: true,
        })
      }
    }
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
        name: name ?? accountLabel(get(), accountId),
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

  renameScenario: async (id, name) => {
    const s = get().scenarios.find((x) => x.id === id)
    if (!s) return
    const updated = { ...s, name, updatedAt: nowISO() }
    await repository.updateScenario(updated)
    set({ scenarios: get().scenarios.map((x) => (x.id === id ? updated : x)) })
  },

  duplicateScenarioById: async (id, name) => {
    const { activePlanId } = get()
    if (!activePlanId) return
    await repository.duplicateScenario(id, name)
    set({ scenarios: await repository.listScenarios(activePlanId) })
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

  moveCard: async (id, dir) => {
    const list = [...get().creditCards].sort((a, b) => a.position - b.position)
    const i = list.findIndex((c) => c.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    await repository.putCreditCard({ ...a, position: b.position })
    await repository.putCreditCard({ ...b, position: a.position })
    set({ creditCards: await repository.listCreditCards() })
  },

  addDebitAccount: async (name) => {
    const { debitAccounts } = get()
    await repository.putDebitAccount({
      id: newId(),
      name,
      color: CARD_COLORS[debitAccounts.length % CARD_COLORS.length],
      position: debitAccounts.length,
    })
    set({ debitAccounts: await repository.listDebitAccounts() })
  },

  updateDebitAccount: async (a) => {
    await repository.putDebitAccount(a)
    set({ debitAccounts: await repository.listDebitAccounts() })
  },

  deleteDebitAccount: async (id) => {
    await repository.deleteDebitAccount(id)
    set({ debitAccounts: await repository.listDebitAccounts() })
  },

  moveDebitAccount: async (id, dir) => {
    const list = [...get().debitAccounts].sort((a, b) => a.position - b.position)
    const i = list.findIndex((d) => d.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const a = list[i]
    const b = list[j]
    await repository.putDebitAccount({ ...a, position: b.position })
    await repository.putDebitAccount({ ...b, position: a.position })
    set({ debitAccounts: await repository.listDebitAccounts() })
  },

  addCategory: async (name, color) => {
    await repository.putCategory({ id: newId(), name, color, kind: 'mixed' })
    set({ categories: await repository.listCategories() })
  },
  updateCategory: async (cat) => {
    await repository.putCategory(cat)
    set({ categories: await repository.listCategories() })
  },
  deleteCategory: async (id) => {
    await repository.deleteCategory(id)
    set({ categories: await repository.listCategories() })
  },
}))
