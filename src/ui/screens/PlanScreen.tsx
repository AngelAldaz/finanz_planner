import { useMemo, useState, type ReactNode } from 'react'
import {
  Anchor,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  CreditCard as CardIcon,
  Lock,
  Plus,
  Unlock,
  X,
} from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { Money } from '../components/Money'
import { MovementSheet, type MovementSubmit, type SheetMode } from './MovementSheet'
import { CardSheet } from './CardSheet'
import { eachWeekStart, mondayOf, weekRangeLabel } from '../../domain/dates'
import { sortMovements } from '../../domain/ledger'
import type { CardState, Category, ComputedScenario, CreditCard, ID, ISODate, Movement } from '../../domain/types'
import { LIQUID } from '../../domain/types'
import { cn } from '../../lib/cn'

export function PlanScreen() {
  const scenarios = usePlanStore((s) => s.scenarios)
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId)
  const categories = usePlanStore((s) => s.categories)
  const creditCards = usePlanStore((s) => s.creditCards)
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
  const addCard = usePlanStore((s) => s.addCard)
  const updateCard = usePlanStore((s) => s.updateCard)
  const deleteCard = usePlanStore((s) => s.deleteCard)

  const computed = useComputed()
  const balById = useMemo(
    () => new Map(computed.points.map((p) => [p.movement.id, p.balanceAfter])),
    [computed],
  )
  const chargedById = useMemo(
    () =>
      new Map(
        computed.points.filter((p) => p.chargedToCardId).map((p) => [p.movement.id, p.chargedToCardId!]),
      ),
    [computed],
  )
  const summaryByWeek = useMemo(
    () => new Map(computed.weeks.map((w) => [w.key.weekStart, w])),
    [computed],
  )
  const cardsById = useMemo(() => new Map(creditCards.map((c) => [c.id, c])), [creditCards])
  const allWeeks = useMemo(() => eachWeekStart(horizon.start, horizon.end), [horizon])

  const weekMap = useMemo(() => {
    const m = new Map<string, Movement[]>()
    // mismo orden que el motor: (fecha efectiva, order) → la lista coincide con el saldo corriente
    for (const mv of sortMovements(movements)) {
      const wk = mondayOf(mv.date ?? mv.weekStart ?? horizon.start)
      const arr = m.get(wk)
      if (arr) arr.push(mv)
      else m.set(wk, [mv])
    }
    return m
  }, [movements, horizon])
  const shownWeeks = useMemo(() => [...weekMap.keys()].sort(), [weekMap])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [defaultWeek, setDefaultWeek] = useState<ISODate | undefined>(undefined)
  const [defaultMode, setDefaultMode] = useState<SheetMode | undefined>(undefined)
  const [cardSheetOpen, setCardSheetOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)

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
      const account = data.accountId ?? LIQUID
      if (editing) {
        const editingWeek = mondayOf(editing.date ?? editing.weekStart ?? ws ?? horizon.start)
        const editingAccount = editing.accountId ?? LIQUID
        if (editing.kind !== 'anchor' || editingWeek !== ws || editingAccount !== account) {
          await deleteMovement(editing.id)
        }
      }
      await setRealBalance(ws ?? horizon.start, data.amount, data.name, account)
    } else if (editing && editing.kind === 'anchor') {
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
        creditEligible: data.creditEligible,
        payCardId: data.payCardId,
      })
    } else {
      await addMovement(data)
    }
  }

  function handleSaveCard(d: { id?: ID; name: string; limit: number }) {
    if (d.id) {
      const existing = creditCards.find((c) => c.id === d.id)
      if (existing) void updateCard({ ...existing, name: d.name, limit: d.limit })
    } else {
      void addCard(d.name, d.limit)
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
              <button
                onClick={() => selectScenario(s.id)}
                className="py-1.5 pl-3 pr-2 text-sm font-bold"
              >
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

      <CardStrip
        cards={computed.cardStates}
        onAdd={() => {
          setEditingCard(null)
          setCardSheetOpen(true)
        }}
        onEdit={(c) => {
          setEditingCard(c)
          setCardSheetOpen(true)
        }}
      />

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
                    chargedToCardId={chargedById.get(mv.id)}
                    category={categories.find((c) => c.id === mv.categoryId)}
                    cardsById={cardsById}
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
        cards={creditCards}
        onSubmit={handleSubmit}
        onDelete={deleteMovement}
      />
      <CardSheet
        open={cardSheetOpen}
        onOpenChange={setCardSheetOpen}
        card={editingCard}
        onSave={handleSaveCard}
        onDelete={(id) => void deleteCard(id)}
      />
    </div>
  )
}

function Hero({ computed }: { computed: ComputedScenario }) {
  const neg = computed.firstNegativeWeek
  return (
    <div className="rounded-chunky border-2 border-ink bg-ink p-5 text-paper shadow-hard">
      <p className="text-xs font-semibold uppercase tracking-wider text-paper/60">
        Saldo líquido final
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

function CardStrip({
  cards,
  onAdd,
  onEdit,
}: {
  cards: CardState[]
  onAdd: () => void
  onEdit: (c: CreditCard) => void
}) {
  if (cards.length === 0) {
    return (
      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-ink/40 py-3 text-sm font-semibold text-muted active:bg-surface"
      >
        <CardIcon size={16} /> Agregar tarjeta de crédito
      </button>
    )
  }
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
      {cards.map(({ card, debt, available, blocked }) => {
        const pct = card.limit > 0 ? Math.min(100, Math.max(0, (debt / card.limit) * 100)) : 0
        return (
          <button
            key={card.id}
            onClick={() => onEdit(card)}
            className="w-44 shrink-0 rounded-chunky border-2 border-ink bg-surface p-3 text-left shadow-hard-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: card.color }} />
              <span className="truncate text-sm font-bold">{card.name}</span>
              {blocked && <Lock size={12} className="shrink-0 text-muted" />}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full border border-ink bg-paper">
              <div
                className="h-full"
                style={{ width: `${pct}%`, background: blocked ? '#8a857a' : card.color }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px]">
              <span className="text-neg">
                debe <Money cents={debt} />
              </span>
              {blocked ? (
                <span className="flex items-center gap-1 text-muted">
                  <Lock size={10} /> bloqueada
                </span>
              ) : (
                <span className="text-pos">
                  <Money cents={available} /> libre
                </span>
              )}
            </div>
          </button>
        )
      })}
      <button
        onClick={onAdd}
        aria-label="Agregar tarjeta"
        className="grid w-12 shrink-0 place-items-center rounded-chunky border-2 border-dashed border-ink/40 active:bg-surface"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}

interface RowProps {
  mv: Movement
  balance?: number
  chargedToCardId?: ID
  category?: Category
  cardsById: Map<ID, CreditCard>
  onEdit: () => void
  onToggle: () => void
}

const TYPE_META = {
  ingreso: { bg: 'bg-pos', fg: 'text-white', Icon: ArrowDownLeft },
  gasto: { bg: 'bg-neg', fg: 'text-white', Icon: ArrowUpRight },
  pago: { bg: 'bg-cobalt', fg: 'text-white', Icon: CardIcon },
  real: { bg: 'bg-accent', fg: 'text-ink', Icon: Anchor },
  bloqueo: { bg: 'bg-ink', fg: 'text-white', Icon: Lock },
} as const

function movementType(mv: Movement): keyof typeof TYPE_META {
  if (mv.cardBlock) return 'bloqueo'
  if (mv.kind === 'anchor') return 'real'
  if (mv.payCardId) return 'pago'
  return mv.amount >= 0 ? 'ingreso' : 'gasto'
}

function MovementRow({ mv, balance, chargedToCardId, category, cardsById, onEdit, onToggle }: RowProps) {
  const meta = TYPE_META[movementType(mv)]
  const isBlock = !!mv.cardBlock
  const Icon = isBlock ? (mv.cardBlock!.blocked ? Lock : Unlock) : meta.Icon
  const isAnchor = mv.kind === 'anchor'
  const isCardAnchor = isAnchor && !!mv.accountId && mv.accountId !== LIQUID
  const anchorCard = isCardAnchor ? cardsById.get(mv.accountId!) : undefined
  const chargedCard = chargedToCardId ? cardsById.get(chargedToCardId) : undefined
  const payCard = mv.payCardId ? cardsById.get(mv.payCardId) : undefined

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-2.5',
        isAnchor && 'bg-accent/10',
        isBlock && 'bg-ink/5',
        !mv.included && 'opacity-40',
      )}
    >
      {/* badge de tipo (ingreso · gasto · pago · saldo real · bloqueo) — también prende/apaga */}
      <button onClick={onToggle} aria-label={mv.included ? 'Excluir' : 'Incluir'} className="shrink-0">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border-2 border-ink',
            mv.included ? `${meta.bg} shadow-hard-sm` : 'bg-surface',
          )}
        >
          <Icon size={15} strokeWidth={2.75} className={mv.included ? meta.fg : 'text-muted'} />
        </span>
      </button>

      <button onClick={onEdit} className="flex flex-1 items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {category && !isAnchor && !isBlock && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: category.color }}
              />
            )}
            <span className="truncate font-medium leading-tight">{mv.name}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1 empty:hidden">
            {isCardAnchor && (
              <Tag color="bg-accent text-ink">saldo {anchorCard?.name ?? 'tarjeta'}</Tag>
            )}
            {chargedCard && <Tag color="bg-cobalt text-white">→ crédito {chargedCard.name}</Tag>}
            {payCard && <Tag color="bg-ink text-paper">{payCard.name}</Tag>}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {isBlock ? null : isAnchor ? (
            <span className="text-sm font-bold">
              = <Money cents={mv.amount} />
            </span>
          ) : (
            <Money cents={mv.amount} signed className="text-sm font-semibold" />
          )}
          {!isCardAnchor && !isBlock && mv.included && balance != null && (
            <Money cents={balance} className="block text-xs text-muted" />
          )}
        </span>
      </button>
    </li>
  )
}

function Tag({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block rounded px-1 text-[10px] font-bold uppercase tracking-wide',
        color,
      )}
    >
      {children}
    </span>
  )
}
