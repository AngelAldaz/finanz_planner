// Tipos del dominio. PURO: sin React, sin IO.

export type ID = string
export type ISODate = string // 'YYYY-MM-DD' (date-only, sin timezone)
export type Cents = number // entero; -982870 === -9828.70
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // lunes=0 … domingo=6

// delta  = suma `amount` (con signo) al saldo corriente
// anchor = FIJA el saldo a `amount` (saldo real), ignorando lo anterior
export type MovementKind = 'delta' | 'anchor'

export interface RecurrenceRule {
  startDate: ISODate
  endDate?: ISODate
  // elige UNA forma de frecuencia:
  every?: { n: number; unit: 'day' | 'week' | 'month' } // "cada 15 días", "cada 2 meses"
  weekdays?: Weekday[] // "cada viernes"
  daysOfMonth?: (number | 'last')[] // "el 15"=[15] · quincena=[15,'last'] · fin de mes=['last']
  nthWeekday?: { nth: 1 | 2 | 3 | 4 | 5 | 'last'; weekday: Weekday } // "primer/último viernes"
  // ajuste si la fecha cae en día inhábil:
  businessDayAdjust?: 'none' | 'previous' | 'next' // default 'previous'
  nonBusiness?: 'weekend' // v1: solo fines de semana
}

export type CatalogKind = 'debt' | 'fixedExpense' | 'income'

export interface CatalogItem {
  id: ID
  catalog: CatalogKind
  name: string
  amount: Cents // tal como entra al libro (deuda = negativo)
  date?: ISODate
  defaultCategoryId?: ID
  recurrence?: RecurrenceRule
}

export interface Category {
  id: ID
  name: string
  color: string
  kind?: 'income' | 'expense' | 'mixed'
}

export interface CreditCard {
  id: ID
  name: string
  limit: Cents
  color: string
  position: number
}

/** accountId del líquido (débito/efectivo). Las tarjetas usan su propio id. */
export const LIQUID = 'liquid'

export interface Plan {
  id: ID
  name: string
  currency: 'MXN'
  horizonStart: ISODate
  horizonEnd: ISODate
  createdAt: string
  updatedAt: string
}

export interface Scenario {
  id: ID
  planId: ID
  name: string
  color?: string
  position: number
  createdAt: string
  updatedAt: string
}

export interface MovementSource {
  kind: 'manual' | 'recurrence' | 'catalog'
  ruleId?: ID
  occurrenceKey?: string // 'ruleId@2026-06-08' → regeneración idempotente
}

export interface Movement {
  id: ID
  scenarioId: ID
  kind: MovementKind
  name: string
  amount: Cents // delta: con signo · anchor: saldo absoluto objetivo
  date?: ISODate // OPCIONAL: si la pones, cae sola en su semana
  weekStart?: ISODate // colocación por semana sin fecha (lunes)
  categoryId?: ID
  creditEligible?: boolean // gasto que PUEDE pagarse con crédito (si el líquido no alcanza)
  accountId?: ID // para anchor: 'liquid' (default) o un cardId (saldo real de la tarjeta)
  payCardId?: ID // delta que abona a esta tarjeta (pago → regresa crédito disponible)
  cardBlock?: { cardId: ID; blocked: boolean } // evento: apaga/enciende una tarjeta a partir de aquí
  included: boolean // prender/apagar sin borrar
  source?: MovementSource
  order: number // orden dentro de la semana
}

export interface ScenarioRecurrence {
  id: ID
  scenarioId: ID
  name: string
  amount: Cents // con signo (las recurrencias son siempre delta)
  categoryId?: ID
  rule: RecurrenceRule
  included: boolean
}

export interface Horizon {
  start: ISODate
  end: ISODate
}

// ---------- view-models (NUNCA se persisten) ----------
export interface LedgerPoint {
  movement: Movement
  balanceBefore: Cents // líquido antes
  balanceAfter: Cents // líquido después
  isAnchor: boolean
  chargedToCardId?: ID // si el gasto se pagó con crédito (el líquido no cambió)
  cardDebtAfter: Record<ID, Cents> // deuda por tarjeta tras este punto
  cardBlockedAfter: Record<ID, boolean> // estado encendida/apagada por tarjeta tras este punto
}

export interface WeekKey {
  weekStart: ISODate
  weekEnd: ISODate
  label: string
}

export interface WeekSummary {
  key: WeekKey
  points: LedgerPoint[]
  openingBalance: Cents
  closingBalance: Cents
  totalIn: Cents
  totalOut: Cents
  lowestBalance: Cents
  lowestAt?: ISODate
  hadAnchor: boolean
  goesNegative: boolean
  cardDebtClosing: Record<ID, Cents> // deuda por tarjeta al cierre de la semana
}

export interface CardState {
  card: CreditCard
  debt: Cents
  available: Cents
  blocked: boolean // estado proyectado al final del horizonte
}

export interface ComputedScenario {
  scenarioId: ID
  points: LedgerPoint[]
  weeks: WeekSummary[]
  finalBalance: Cents // líquido final
  minBalance: Cents
  minBalanceAt?: ISODate
  firstNegativeWeek?: WeekKey
  firstNegativeAt?: ISODate
  cardStates: CardState[]
}

export interface ScenarioComparison {
  aId: ID
  bId: ID
  rows: Array<{
    week: WeekKey
    aClosing?: Cents
    bClosing?: Cents
    delta?: Cents // b - a
    differs: boolean
  }>
  minBalanceDelta: Cents
  firstNegativeDiffers: boolean
}

export interface BackupBundle {
  version: number
  plans: Plan[]
  scenarios: Scenario[]
  movements: Movement[]
  recurrences: ScenarioRecurrence[]
  categories: Category[]
  catalogItems: CatalogItem[]
  creditCards: CreditCard[]
}
