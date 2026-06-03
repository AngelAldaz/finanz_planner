import { useEffect, useState } from 'react'
import { usePlanStore } from './state/planStore'
import { PlanScreen } from './ui/screens/PlanScreen'

type Tab = 'plan' | 'escenarios' | 'graficas' | 'catalogos' | 'ajustes'

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'plan', label: 'Plan', glyph: '▤' },
  { id: 'escenarios', label: 'Escenarios', glyph: '⧉' },
  { id: 'graficas', label: 'Gráficas', glyph: '◔' },
  { id: 'catalogos', label: 'Catálogos', glyph: '☰' },
  { id: 'ajustes', label: 'Ajustes', glyph: '⚙' },
]

export default function App() {
  const init = usePlanStore((s) => s.init)
  const ready = usePlanStore((s) => s.ready)
  const [tab, setTab] = useState<Tab>('plan')

  useEffect(() => {
    void init()
  }, [init])

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="font-display text-2xl font-bold tracking-tight">finanz.</h1>
        <p className="text-sm text-muted">Tu dinero, semana a semana.</p>
      </header>

      <main className="flex-1 px-4 py-4">
        {!ready ? (
          <Loading />
        ) : tab === 'plan' ? (
          <PlanScreen />
        ) : (
          <Placeholder tab={tab} />
        )}
      </main>

      <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t-2 border-ink bg-surface pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors ' +
                (active ? 'text-ink' : 'text-muted')
              }
            >
              <span
                className={
                  'flex h-9 w-9 items-center justify-center rounded-chunky border-2 text-lg ' +
                  (active ? 'border-ink bg-accent shadow-hard-sm' : 'border-transparent')
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
      <span className="animate-pulse font-display text-lg font-bold text-ink">finanz…</span>
    </div>
  )
}

function Placeholder({ tab }: { tab: Tab }) {
  return (
    <div className="grid place-items-center gap-1 rounded-chunky border-2 border-dashed border-ink/40 p-10 text-center text-sm text-muted">
      <span className="font-display text-lg font-bold text-ink">Próximamente</span>
      <span>Sección «{tab}»</span>
    </div>
  )
}
