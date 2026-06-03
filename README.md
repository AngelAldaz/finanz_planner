# finanz

Planeador de **flujo de efectivo por semana, con escenarios**. Pones tu saldo, sueltas tus ingresos y gastos por semana, ves tu saldo corriendo semana a semana y puedes "jugar": duplicar el plan, mover gastos, comparar.

Nace de un Excel ("Ingreso y gasto por semana") y lo convierte en una **PWA local-first** instalable en el iPhone (offline, sin cuenta), arquitectada para crecer a SaaS sin reescribir.

## Idea central

Cada movimiento es:

- **`delta`** — suma con signo al saldo (ingreso `+` / gasto `−`), o
- **`anchor`** — **fija** el saldo a tu dinero real, ignorando lo proyectado.

El "Dinero en tarjeta" inicial y los re-anclajes semanales ("forzar el saldo real y ver hacia adelante") son el mismo mecanismo.

## Stack

React 19 · TypeScript · Vite · Tailwind v4 · Zustand · Dexie (IndexedDB) · vite-plugin-pwa · Vitest. UI estilo _bold/neo-brutalist_ (Radix + Vaul + Framer Motion).

## Arquitectura (capas, dependencias hacia adentro)

```
src/domain/   PURO: tipos + cálculo (saldo corriente, semanas, recurrencias, escenarios). 100% testeado.
src/data/     puerto PlanRepository + adaptador Dexie + semilla. (seam para Supabase a futuro)
src/state/    Zustand + selectores memoizados sobre el motor.
src/ui/        pantallas + sistema de diseño.
```

El dominio no importa nada de React/IO. El dinero son **centavos enteros** (cero drift); las fechas, **ISO date-only** (sin bug de timezone en iOS).

## Scripts

```bash
pnpm dev        # servidor de desarrollo
pnpm test       # pruebas (Vitest)
pnpm typecheck  # tsc --noEmit
pnpm build      # build de producción (PWA)
```

## Estado

- **F1 — Motor (✓):** 21 pruebas en verde. Compuerta de aceptación: los cierres del Excel real dan **37,575 / 20,275 / 12,000.96** exactos.
- F2 persistencia local · F3 UI núcleo · F4 escenarios/recurrencias/catálogos · F5 pulido. (ver plan)
