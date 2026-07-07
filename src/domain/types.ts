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

/** Tarjeta de débito / cuenta de banco: liquidez con saldo propio (sin límite). */
export interface DebitAccount {
  id: ID
  name: string
  color: string
  position: number // jerarquía de prioridad entre débitos
}

/** id del efectivo (la cuenta de liquidez base, siempre presente). */
export const LIQUID = 'liquid'
export const EFECTIVO_NAME = 'Efectivo'

export interface Plan {
  id: ID
  name: string
  currency: 'MXN'
  horizonStart: ISODate
  horizonEnd: ISODate
  lowBalanceThreshold?: Cents // avísame si el saldo baja de esto
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
  // ¿con qué se puede pagar este gasto? (default: efectivo y débito sí, crédito no)
  cashEligible?: boolean // ¿pagable con efectivo? (default true)
  debitEligible?: boolean // ¿pagable con tarjeta de débito? (default true)
  creditEligible?: boolean // ¿pagable con crédito? (default false)
  paidWith?: ID // cuenta usada para este delta: destino (ingreso) · origen (pago) · con qué se pagó (gasto: override manual)
  accountId?: ID // para anchor: 'liquid' (default), un débito o un cardId (saldo real de esa cuenta)
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
  creditEligible?: boolean
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
  balanceBefore: Cents // líquido TOTAL antes (efectivo + débitos)
  balanceAfter: Cents // líquido TOTAL después
  isAnchor: boolean
  paidFrom?: ID // cuenta que efectivamente pagó el gasto (o a la que entró el ingreso)
  chargedToCardId?: ID // si el gasto se pagó con crédito (paidFrom es una TDC; el líquido no cambió)
  cashAfter: Record<ID, Cents> // saldo por cuenta de liquidez (efectivo + cada débito) tras este punto
  cardDebtAfter: Record<ID, Cents> // deuda por tarjeta tras este punto
  cardBlockedAfter: Record<ID, boolean> // estado encendida/apagada por cuenta (débito y crédito) tras este punto
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
  cashClosing: Record<ID, Cents> // saldo de liquidez por cuenta al cierre de la semana
  cardDebtClosing: Record<ID, Cents> // deuda por tarjeta al cierre de la semana
}

export interface CardState {
  card: CreditCard
  debt: Cents
  available: Cents
  blocked: boolean // estado proyectado al final del horizonte
}

/** Saldo proyectado de una cuenta de liquidez (efectivo o débito). */
export interface CashState {
  id: ID
  name: string
  kind: 'cash' | 'debit'
  balance: Cents
  blocked: boolean // solo aplica a débitos
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
  cashStates: CashState[] // efectivo + débitos, con su saldo final
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
  debitAccounts?: DebitAccount[]
}
