// Semilla = datos reales del Excel "PLAN DE GASTOS" (Hoja1, "Ingreso y gasto por semana").
// Sirve de dataset inicial y de fixture de tests (los cierres deben dar 37,575 / 20,275 / 12,000.96).
import type {
  BackupBundle,
  CatalogItem,
  Category,
  Horizon,
  Movement,
  MovementKind,
  Plan,
  Scenario,
} from '../../domain/types'
import { toCents } from '../../domain/money'

export const SEED_PLAN_ID = 'seed-plan'
export const SEED_SCENARIO_ID = 'seed-scenario'
export const SEED_HORIZON: Horizon = { start: '2026-05-25', end: '2026-07-05' }

type Row = [week: string, name: string, pesos: number, kind?: MovementKind]

const ROWS: Row[] = [
  // Semana 25–31 mayo
  ['2026-05-25', 'Dinero en tarjeta', 20375, 'anchor'],
  ['2026-05-25', 'Comida semana', -1000],
  ['2026-05-25', 'Cumple de Clau', -1000],
  ['2026-05-25', 'ChatGPT', -400],
  ['2026-05-25', 'Don René', 3200],
  ['2026-05-25', 'Cumple de Mariana', -1000],
  ['2026-05-25', 'Gasolina', -1000],
  ['2026-05-25', 'Cumple de Daniela', -1000],
  ['2026-05-25', 'Memo', 5000],
  ['2026-05-25', 'Ramón', 6400],
  ['2026-05-25', 'Rubén', 8000],
  // Semana 1–7 junio
  ['2026-06-01', 'Pensión', 2500],
  ['2026-06-01', 'Comida semana', -1000],
  ['2026-06-01', 'Casetas', -2000],
  ['2026-06-01', 'Comida Cancún', -2000],
  ['2026-06-01', 'Gasolina Cancún', -1000],
  ['2026-06-01', 'Regalo Daniela', -2000],
  ['2026-06-01', 'Teléfonos', -2000],
  ['2026-06-01', 'Don René', 1200],
  ['2026-06-01', 'Gasolina 1', -1000],
  ['2026-06-01', 'Viaje a México', -10000],
  // Semana 8–14 junio
  ['2026-06-08', 'Comida semana', -1000],
  ['2026-06-08', 'Cumple de Renato', -3500],
  ['2026-06-08', 'Don René', 1200],
  ['2026-06-08', 'Netflix', -270],
  ['2026-06-08', 'Gasolina 2', -1000],
  ['2026-06-08', 'Credito BBVA', -9828.7],
  ['2026-06-08', 'Credito BBVA', 5412],
  ['2026-06-08', 'NU', -2937.34],
  ['2026-06-08', 'Sarabia', 12000],
  ['2026-06-08', 'Rubén', 23800],
  ['2026-06-08', 'Liverpool', -1650],
  ['2026-06-08', 'Depa', -30500],
  // Semana 15–21 junio
  ['2026-06-15', 'Comida semana', -1000],
  ['2026-06-15', 'ChatGPT', -400],
  ['2026-06-15', 'HBO', -300],
  ['2026-06-15', 'Don René', 1200],
  ['2026-06-15', 'Gasolina 3', -1000],
  // Semana 22–28 junio
  ['2026-06-22', 'Comida semana', -1000],
  ['2026-06-22', 'Audible', -150],
  ['2026-06-22', 'Don René', 1200],
  ['2026-06-22', 'Gasolina 4', -1000],
  ['2026-06-22', 'Sarabia', 12000],
  // Semana 29 jun – 5 jul
  ['2026-06-29', 'Comida semana', -1000],
  ['2026-06-29', 'Cumple de Cecilia', -1000],
  ['2026-06-29', 'Don René', 1200],
  ['2026-06-29', 'Gasolina 4', -1000],
]

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-ingreso', name: 'Ingreso', color: '#0e9f6e', kind: 'income' },
  { id: 'cat-comida', name: 'Comida', color: '#e8923c', kind: 'expense' },
  { id: 'cat-gasolina', name: 'Gasolina', color: '#2e5bff', kind: 'expense' },
  { id: 'cat-subs', name: 'Suscripciones', color: '#9b51e0', kind: 'expense' },
  { id: 'cat-regalos', name: 'Regalos', color: '#ff3b30', kind: 'expense' },
  { id: 'cat-deudas', name: 'Deudas', color: '#141414', kind: 'expense' },
  { id: 'cat-viajes', name: 'Viajes', color: '#00a3a3', kind: 'expense' },
  { id: 'cat-otros', name: 'Otros', color: '#8a857a', kind: 'mixed' },
]

function categoryFor(name: string, amount: number): string | undefined {
  const n = name.toLowerCase()
  if (n.includes('comida')) return 'cat-comida'
  if (n.includes('gasolina')) return 'cat-gasolina'
  if (['chatgpt', 'netflix', 'hbo', 'audible'].some((s) => n.includes(s))) return 'cat-subs'
  if (n.includes('cumple') || n.includes('regalo')) return 'cat-regalos'
  if (n.includes('credito') || n === 'nu' || n.includes('depa')) return 'cat-deudas'
  if (n.includes('viaje') || n.includes('caseta')) return 'cat-viajes'
  if (amount > 0) return 'cat-ingreso'
  return 'cat-otros'
}

export const SEED_CATALOG: CatalogItem[] = [
  { id: 'cti-bbva', catalog: 'debt', name: 'Credito BBVA', amount: toCents(-9828.7), date: '2026-06-11', defaultCategoryId: 'cat-deudas' },
  { id: 'cti-nu', catalog: 'debt', name: 'NU', amount: toCents(-2937.34), date: '2026-06-14', defaultCategoryId: 'cat-deudas' },
  { id: 'cti-depa', catalog: 'debt', name: 'Depa', amount: toCents(-30500), date: '2026-06-15', defaultCategoryId: 'cat-deudas' },
]

export function buildSeedMovements(scenarioId: string = SEED_SCENARIO_ID): Movement[] {
  return ROWS.map(([week, name, pesos, kind], i) => ({
    id: `seed-m-${i}`,
    scenarioId,
    kind: kind ?? 'delta',
    name,
    amount: toCents(pesos),
    weekStart: week,
    categoryId: categoryFor(name, pesos),
    included: true,
    source: { kind: 'manual' as const },
    order: i,
  }))
}

/** Entrada lista para `buildComputedScenario` (usada también por los tests). */
export function seedScenarioInput() {
  return {
    scenarioId: SEED_SCENARIO_ID,
    movements: buildSeedMovements(),
    recurrences: [],
    horizon: SEED_HORIZON,
  }
}

export function buildSeedBundle(now: string): BackupBundle {
  const plan: Plan = {
    id: SEED_PLAN_ID,
    name: 'Plan mayo–junio 2026',
    currency: 'MXN',
    horizonStart: SEED_HORIZON.start,
    horizonEnd: SEED_HORIZON.end,
    createdAt: now,
    updatedAt: now,
  }
  const scenario: Scenario = {
    id: SEED_SCENARIO_ID,
    planId: SEED_PLAN_ID,
    name: 'Realista',
    position: 0,
    createdAt: now,
    updatedAt: now,
  }
  return {
    version: 1,
    plans: [plan],
    scenarios: [scenario],
    movements: buildSeedMovements(),
    recurrences: [],
    categories: SEED_CATEGORIES,
    catalogItems: SEED_CATALOG,
    creditCards: [],
  }
}

/** Plan vacío para "empezar de cero": un plan + un escenario, sin movimientos. */
export function buildEmptyBundle(now: string): BackupBundle {
  const today = now.slice(0, 10)
  const plan: Plan = {
    id: SEED_PLAN_ID,
    name: 'Mi plan',
    currency: 'MXN',
    horizonStart: today,
    horizonEnd: today,
    createdAt: now,
    updatedAt: now,
  }
  const scenario: Scenario = {
    id: SEED_SCENARIO_ID,
    planId: SEED_PLAN_ID,
    name: 'Principal',
    position: 0,
    createdAt: now,
    updatedAt: now,
  }
  return {
    version: 1,
    plans: [plan],
    scenarios: [scenario],
    movements: [],
    recurrences: [],
    categories: SEED_CATEGORIES,
    catalogItems: [],
    creditCards: [],
  }
}
