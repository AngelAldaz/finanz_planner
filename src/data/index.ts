export type { PlanRepository } from './repository'
export { DexiePlanRepository } from './dexie/DexiePlanRepository'
export { newId, nowISO } from './ids'

import { DexiePlanRepository } from './dexie/DexiePlanRepository'
import type { PlanRepository } from './repository'

/** Instancia única del repositorio que usa la app (cambiar aquí para Supabase a futuro). */
export const repository: PlanRepository = new DexiePlanRepository()
