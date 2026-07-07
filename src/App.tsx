import { lazy, Suspense, useEffect, useState } from 'react'
import { usePlanStore } from './state/planStore'
import { useUiStore } from './state/uiStore'
import { PlanScreen } from './ui/screens/PlanScreen'
import { CuentasScreen } from './ui/screens/CuentasScreen'
import { CategoriasScreen } from './ui/screens/CategoriasScreen'
import { LockScreen } from './ui/screens/LockScreen'

// chunks diferidos (Recharts y Supabase son pesados → solo al abrir su pestaña)
const ChartsScreen = lazy(() =>
  import('./ui/screens/ChartsScreen').then((m) => ({ default: m.ChartsScreen })),
)
const AjustesScreen = lazy(() =>
  import('./ui/screens/AjustesScreen').then((m) => ({ default: m.AjustesScreen })),
)

type Tab = 'plan' | 'cuentas' | 'graficas' | 'catalogos' | 'ajustes'

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'plan', label: 'Plan', glyph: '▤' },
  { id: 'cuentas', label: 'Cuentas', glyph: '▦' },
  { id: 'graficas', label: 'Gráficas', glyph: '◔' },
  { id: 'catalogos', label: 'Categorías', glyph: '☰' },
  { id: 'ajustes', label: 'Ajustes', glyph: '⚙' },
]

export default function App() {
  const init = usePlanStore((s) => s.init)
  const ready = usePlanStore((s) => s.ready)
  const [tab, setTab] = useState<Tab>('plan')
  const locked = useUiStore((s) => s.locked)
  const setLocked = useUiStore((s) => s.setLocked)

  useEffect(() => {
    void init()
  }, [init])

  // arranca la nube (auth + sync) solo si pegaste tus llaves de Supabase
  useEffect(() => {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      void import('./state/cloudStore').then((m) => m.useCloudStore.getState().start())
    }
  }, [])

  if (locked) return <LockScreen onUnlock={() => setLocked(false)} />

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b-2 border-line bg-canvas px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-2xl font-bold tracking-tight">finanz.</h1>
        <p className="text-sm text-muted">Tu dinero, semana a semana.</p>
      </header>

      <main className="flex-1 px-4 py-4">
        {!ready ? (
          <Loading />
        ) : tab === 'plan' ? (
          <PlanScreen />
        ) : tab === 'graficas' ? (
          <Suspense fallback={<Loading />}>
            <ChartsScreen />
          </Suspense>
        ) : tab === 'cuentas' ? (
          <CuentasScreen />
        ) : tab === 'catalogos' ? (
          <CategoriasScreen />
        ) : tab === 'ajustes' ? (
          <Suspense fallback={<Loading />}>
            <AjustesScreen />
          </Suspense>
        ) : (
          <Placeholder tab={tab} />
        )}
      </main>

      <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ' +
                (active ? 'text-fg' : 'text-muted')
              }
            >
              <span
                className={
                  'flex h-9 w-9 items-center justify-center rounded-chunky border-2 text-lg ' +
                  (active ? 'border-line bg-accent text-ink shadow-hard-sm' : 'border-transparent')
                }
              >
                {t.glyph}
              </span>
              {t.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function Loading() {
  return (
    <div className="grid h-64 place-items-center text-sm text-muted">
      <span className="animate-pulse font-display text-lg font-bold text-fg">finanz…</span>
    </div>
  )
}

function Placeholder({ tab }: { tab: Tab }) {
  return (
    <div className="grid place-items-center gap-1 rounded-chunky border-2 border-dashed border-line/40 p-10 text-center text-sm text-muted">
      <span className="font-display text-lg font-bold text-fg">Próximamente</span>
      <span>Sección «{tab}»</span>
    </div>
  )
}
