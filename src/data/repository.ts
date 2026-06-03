// Puerto de almacenamiento. La UI y el estado hablan SOLO con esta interfaz,
// nunca con Dexie ni Supabase directamente → añadir nube luego = un adaptador nuevo.
import type {
  BackupBundle,
  CatalogItem,
  CatalogKind,
  Category,
  CreditCard,
  ID,
  Movement,
  Plan,
  Scenario,
  ScenarioRecurrence,
} from '../domain/types'

export interface PlanRepository {
  // plans
  listPlans(): Promise<Plan[]>
  getPlan(id: ID): Promise<Plan | undefined>
  createPlan(p: Plan): Promise<void>
  updatePlan(p: Plan): Promise<void>
  deletePlan(id: ID): Promise<void>

  // scenarios
  listScenarios(planId: ID): Promise<Scenario[]>
  getScenario(id: ID): Promise<Scenario | undefined>
  createScenario(s: Scenario): Promise<void>
  updateScenario(s: Scenario): Promise<void>
  deleteScenario(id: ID): Promise<void>
  /** Copia profunda (movimientos + recurrencias) con IDs nuevos. Devuelve el id del escenario nuevo. */
  duplicateScenario(srcScenarioId: ID, newName: string): Promise<ID>

  // movements
  listMovements(scenarioId: ID): Promise<Movement[]>
  putMovement(m: Movement): Promise<void>
  bulkPutMovements(ms: Movement[]): Promise<void>
  deleteMovement(id: ID): Promise<void>

  // recurrences
  listRecurrences(scenarioId: ID): Promise<ScenarioRecurrence[]>
  putRecurrence(r: ScenarioRecurrence): Promise<void>
  deleteRecurrence(id: ID): Promise<void>

  // categories
  listCategories(): Promise<Category[]>
  putCategory(c: Category): Promise<void>

  // catalogs
  listCatalogItems(catalog?: CatalogKind): Promise<CatalogItem[]>
  putCatalogItem(i: CatalogItem): Promise<void>
  deleteCatalogItem(id: ID): Promise<void>

  // credit cards
  listCreditCards(): Promise<CreditCard[]>
  putCreditCard(c: CreditCard): Promise<void>
  deleteCreditCard(id: ID): Promise<void>

  // bulk / sync seam
  isEmpty(): Promise<boolean>
  exportAll(): Promise<BackupBundle>
  importAll(bundle: BackupBundle): Promise<void>
}
