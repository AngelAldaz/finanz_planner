import { useEffect, useState } from 'react'
import { Check, Copy, Trash2 } from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { repository } from '../../data'
import { buildComputedScenario } from '../../domain/plan'
import { Money } from '../components/Money'
import { cn } from '../../lib/cn'
import type { Cents, ID } from '../../domain/types'

type Stat = { final: Cents; min: Cents; negative: boolean }

export function EscenariosScreen() {
  const scenarios = usePlanStore((s) => s.scenarios)
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId)
  const cards = usePlanStore((s) => s.creditCards)
  const horizon = usePlanStore((s) => s.horizon)
  const movements = usePlanStore((s) => s.movements)
  const selectScenario = usePlanStore((s) => s.selectScenario)
  const renameScenario = usePlanStore((s) => s.renameScenario)
  const duplicateScenarioById = usePlanStore((s) => s.duplicateScenarioById)
  const deleteScenario = usePlanStore((s) => s.deleteScenario)

  const [stats, setStats] = useState<Record<ID, Stat>>({})

  useEffect(() => {
    let alive = true
    void (async () => {
      const entries = await Promise.all(
        scenarios.map(async (s) => {
          const [movs, recs] = await Promise.all([
            repository.listMovements(s.id),
            repository.listRecurrences(s.id),
          ])
          const c = buildComputedScenario({ movements: movs, recurrences: recs, cards, horizon })
          return [s.id, { final: c.finalBalance, min: c.minBalance, negative: !!c.firstNegativeWeek }] as const
        }),
      )
      if (alive) setStats(Object.fromEntries(entries))
    })()
    return () => {
      alive = false
    }
  }, [scenarios, cards, horizon, movements])

  return (
    <div className="space-y-4 pb-28">
      <p className="px-1 text-sm text-muted">
        Tus planes paralelos. Edita el nombre, duplica para «jugar» con variantes y usa el que quieras.
      </p>
      {scenarios.map((s) => {
        const st = stats[s.id]
        const active = s.id === activeScenarioId
        return (
          <section
            key={s.id}
            className={cn(
              'rounded-chunky border-2 border-line bg-surface p-4 shadow-hard',
              active && 'ring-2 ring-accent',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <input
                defaultValue={s.name}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== s.name) void renameScenario(s.id, v)
                }}
                className="min-w-0 flex-1 bg-transparent font-display text-lg font-bold outline-none"
              />
              {active && (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-ink">
                  <Check size={12} /> Activo
                </span>
              )}
            </div>

            {st && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted">
                <span>
                  final <Money cents={st.final} className="font-semibold text-fg" />
                </span>
                <span className={cn(st.negative && 'font-semibold text-neg')}>
                  mínimo <Money cents={st.min} />
                </span>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              {!active && (
                <button
                  onClick={() => void selectScenario(s.id)}
                  className="flex-1 rounded-chunky border-2 border-line bg-ink py-2 text-sm font-bold text-paper active:translate-y-0.5"
                >
                  Usar este
                </button>
              )}
              <button
                onClick={() => void duplicateScenarioById(s.id, `${s.name} (copia)`)}
                aria-label="Duplicar"
                className="rounded-chunky border-2 border-line bg-surface px-3 py-2 active:translate-y-0.5"
              >
                <Copy size={16} />
              </button>
              {scenarios.length > 1 && (
                <button
                  onClick={() => {
                    if (window.confirm(`¿Borrar el escenario "${s.name}"?`)) void deleteScenario(s.id)
                  }}
                  aria-label="Borrar"
                  className="rounded-chunky border-2 border-line bg-surface px-3 py-2 text-neg active:translate-y-0.5"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
