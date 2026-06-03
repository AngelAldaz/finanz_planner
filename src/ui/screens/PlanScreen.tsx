import { useMemo, useState } from 'react'
import { Anchor, Copy, Plus, X } from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { Money } from '../components/Money'
import { MovementSheet, type MovementSubmit, type SheetMode } from './MovementSheet'
import { eachWeekStart, mondayOf, weekRangeLabel } from '../../domain/dates'
import type { Category, ComputedScenario, ID, ISODate, Movement } from '../../domain/types'
import { cn } from '../../lib/cn'

export function PlanScreen() {
  const scenarios = usePlanStore((s) => s.scenarios)
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId)
  const categories = usePlanStore((s) => s.categories)
  const movements = usePlanStore((s) => s.movements)
  const horizon = usePlanStore((s) => s.horizon)
  const selectScenario = usePlanStore((s) => s.selectScenario)
  const duplicate = usePlanStore((s) => s.duplicateActiveScenario)
  const deleteScenario = usePlanStore((s) => s.deleteScenario)
  const addMovement = usePlanStore((s) => s.addMovement)
  const updateMovement = usePlanStore((s) => s.updateMovement)
  const deleteMovement = usePlanStore((s) => s.deleteMovement)
  const toggleIncluded = usePlanStore((s) => s.toggleIncluded)
  const setRealBalance = usePlanStore((s) => s.setRealBalance)

  const computed = useComputed()
  const balById = useMemo(
    () => new Map(computed.points.map((p) => [p.movement.id, p.balanceAfter])),
    [computed],
  )
  const summaryByWeek = useMemo(
    () => new Map(computed.weeks.map((w) => [w.key.weekStart, w])),
    [computed],
  )
  const allWeeks = useMemo(() => eachWeekStart(horizon.start, horizon.end), [horizon])

  const weekMap = useMemo(() => {
    const m = new Map<string, Movement[]>()
    for (const mv of movements) {
      const wk = mondayOf(mv.date ?? mv.weekStart ?? horizon.start)
      const arr = m.get(wk)
      if (arr) arr.push(mv)
      else m.set(wk, [mv])
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order)
    return m
  }, [movements, horizon])
  const shownWeeks = useMemo(() => [...weekMap.keys()].sort(), [weekMap])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [defaultWeek, setDefaultWeek] = useState<ISODate | undefined>(undefined)
  const [defaultMode, setDefaultMode] = useState<SheetMode | undefined>(undefined)

  function openNew(week?: ISODate, mode?: SheetMode) {
    setEditing(null)
    setDefaultWeek(week)
    setDefaultMode(mode)
    setSheetOpen(true)
  }
  function openEdit(m: Movement) {
    setEditing(m)
    setDefaultWeek(undefined)
    setDefaultMode(undefined)
    setSheetOpen(true)
  }

  async function handleSubmit(data: MovementSubmit) {
    const ws = data.weekStart
    if (data.kind === 'anchor') {
      // el saldo real se gestiona como "uno por semana, fijado al inicio"
      if (editing) {
        const editingWeek = mondayOf(editing.date ?? editing.weekStart ?? ws ?? horizon.start)
        if (editing.kind !== 'anchor' || editingWeek !== ws) await deleteMovement(editing.id)
      }
      await setRealBalance(ws ?? horizon.start, data.amount, data.name)
    } else if (editing && editing.kind === 'anchor') {
      // convertir saldo real → movimiento normal
      await deleteMovement(editing.id)
      await addMovement(data)
    } else if (editing) {
      await updateMovement({
        ...editing,
        kind: 'delta',
        name: data.name,
        amount: data.amount,
        weekStart: data.weekStart,
        date: data.date,
        categoryId: data.categoryId,
      })
    } else {
      await addMovement(data)
    }
  }

  function confirmDeleteScenario(id: ID, name: string) {
    if (window.confirm(`¿Borrar el escenario "${name}"? Esto no se puede deshacer.`)) {
      void deleteScenario(id)
    }
  }

  return (
    <div className="space-y-5 pb-28">
      {/* switcher de escenarios */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
        {scenarios.map((s) => {
          const active = s.id === activeScenarioId
          return (
            <div
              key={s.id}
              className={cn(
                'flex shrink-0 items-center rounded-chunky border-2 border-ink',
                active ? 'bg-ink text-paper' : 'bg-surface',
              )}
            >
              <button onClick={() => selectScenario(s.id)} className="py-1.5 pl-3 pr-2 text-sm font-bold">
                {s.name}
              </button>
              {active && scenarios.length > 1 && (
                <button
                  onClick={() => confirmDeleteScenario(s.id, s.name)}
                  aria-label="Borrar escenario"
                  className="pr-2 text-paper/70 active:text-paper"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )
        })}
        <button
          onClick={() => duplicate(`Escenario ${scenarios.length + 1}`)}
          aria-label="Duplicar escenario"
          className="shrink-0 rounded-chunky border-2 border-ink bg-surface p-2 active:translate-y-0.5"
        >
          <Copy size={16} />
        </button>
      </div>

      <Hero computed={computed} />

      <div className="space-y-4">
        {shownWeeks.map((ws) => {
          const summary = summaryByWeek.get(ws)
          const rows = weekMap.get(ws) ?? []
          return (
            <section
              key={ws}
              className="overflow-hidden rounded-chunky border-2 border-ink bg-surface shadow-hard"
            >
              <header className="border-b-2 border-ink bg-paper px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide">
                    {weekRangeLabel(ws)}
                  </h2>
                  {summary && <Money cents={summary.closingBalance} className="text-lg font-bold" />}
                </div>
                {summary && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
                    <span className="text-pos">
                      ↑ <Money cents={summary.totalIn} />
                    </span>
                    <span className="text-neg">
                      ↓ <Money cents={Math.abs(summary.totalOut)} />
                    </span>
                    <span className={cn(summary.goesNegative && 'font-bold text-neg')}>
                      mín <Money cents={summary.lowestBalance} />
                    </span>
                  </div>
                )}
              </header>

              <ul className="divide-y divide-ink/10">
                {rows.map((mv) => (
                  <MovementRow
                    key={mv.id}
                    mv={mv}
                    balance={balById.get(mv.id)}
                    category={categories.find((c) => c.id === mv.categoryId)}
                    onEdit={() => openEdit(mv)}
                    onToggle={() => toggleIncluded(mv.id)}
                  />
                ))}
              </ul>

              <div className="flex items-center gap-1 border-t-2 border-ink/10 p-1.5">
                <button
                  onClick={() => openNew(ws)}
                  className="flex-1 rounded-lg py-2 text-sm font-semibold text-muted active:bg-paper"
                >
                  + Movimiento
                </button>
                <button
                  onClick={() => openNew(ws, 'real')}
                  className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-muted active:bg-paper"
                >
                  <Anchor size={14} /> Saldo real
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <button
        onClick={() => openNew()}
        aria-label="Agregar movimiento"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-accent shadow-hard-lg transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm"
      >
        <Plus size={26} />
      </button>

      <MovementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        movement={editing}
        defaultWeek={defaultWeek}
        defaultMode={defaultMode}
        weeks={allWeeks}
        categories={categories}
        onSubmit={handleSubmit}
        onDelete={deleteMovement}
      />
    </div>
  )
}

function Hero({ computed }: { computed: ComputedScenario }) {
  const neg = computed.firstNegativeWeek
  return (
    <div className="rounded-chunky border-2 border-ink bg-ink p-5 text-paper shadow-hard">
      <p className="text-xs font-semibold uppercase tracking-wider text-paper/60">
        Saldo final proyectado
      </p>
      <Money cents={computed.finalBalance} className="mt-1 block text-4xl font-bold text-paper" />
      <div className="mt-2 text-sm text-paper/70">
        punto más bajo <Money cents={computed.minBalance} className="text-paper" />
      </div>
      <div
        className={cn(
          'mt-3 inline-block rounded-full border-2 px-3 py-1 text-xs font-bold',
          neg ? 'border-neg bg-neg text-white' : 'border-accent bg-accent text-ink',
        )}
      >
        {neg ? `En rojo: semana ${neg.label}` : 'Nunca te quedas en rojo ✓'}
      </div>
    </div>
  )
}

interface RowProps {
  mv: Movement
  balance?: number
  category?: Category
  onEdit: () => void
  onToggle: () => void
}

function MovementRow({ mv, balance, category, onEdit, onToggle }: RowProps) {
  const isAnchor = mv.kind === 'anchor'
  return (
    <li className={cn('flex items-center gap-3 px-4 py-2.5', !mv.included && 'opacity-40')}>
      <button onClick={onToggle} aria-label="Incluir/excluir" className="shrink-0 p-1">
        <span
          className="block h-3.5 w-3.5 rounded-full border-2 border-ink"
          style={{ background: mv.included ? (category?.color ?? '#141414') : 'transparent' }}
        />
      </button>
      <button onClick={onEdit} className="flex flex-1 items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block truncate font-medium leading-tight">{mv.name}</span>
          {isAnchor && (
            <span className="mt-0.5 inline-block rounded bg-accent px-1 text-[10px] font-bold uppercase tracking-wide text-ink">
              = saldo real
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          {isAnchor ? (
            <Money cents={mv.amount} className="text-sm font-semibold" />
          ) : (
            <Money cents={mv.amount} signed className="text-sm font-semibold" />
          )}
          {mv.included && balance != null && (
            <Money cents={balance} className="block text-xs text-muted" />
          )}
        </span>
      </button>
    </li>
  )
}
