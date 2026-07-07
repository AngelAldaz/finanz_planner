import { useMemo, useState, type ReactNode } from 'react'
import {
  Anchor,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard as CardIcon,
  Lock,
  Plus,
  Repeat,
  Unlock,
  Wallet,
  X,
} from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { Money } from '../components/Money'
import { MovementSheet, type MovementSubmit, type SheetMode } from './MovementSheet'
import { CardSheet } from './CardSheet'
import { DebitSheet } from './DebitSheet'
import { addDays, dayLabel, eachWeekStart, mondayOf, parseISO, weekRangeLabel } from '../../domain/dates'
import { sortMovements } from '../../domain/ledger'
import type {
  CardState,
  Category,
  ComputedScenario,
  CreditCard,
  DebitAccount,
  ID,
  ISODate,
  Movement,
} from '../../domain/types'
import { EFECTIVO_NAME, LIQUID } from '../../domain/types'

type AccountMeta = { name: string; color: string; kind: 'cash' | 'debit' | 'credit' }
type PoolBal = { balance: number; kind: 'efectivo' | 'debito' }
type DebitCardView = { id: ID; name: string; color: string; balance: number; blocked: boolean }
import { formatMXNCompact } from '../../domain/money'
import { cn } from '../../lib/cn'

export function PlanScreen() {
  const scenarios = usePlanStore((s) => s.scenarios)
  const activeScenarioId = usePlanStore((s) => s.activeScenarioId)
  const categories = usePlanStore((s) => s.categories)
  const creditCards = usePlanStore((s) => s.creditCards)
  const debitAccounts = usePlanStore((s) => s.debitAccounts)
  const movements = usePlanStore((s) => s.movements)
  const horizon = usePlanStore((s) => s.horizon)
  const selectScenario = usePlanStore((s) => s.selectScenario)
  const duplicate = usePlanStore((s) => s.duplicateActiveScenario)
  const deleteScenario = usePlanStore((s) => s.deleteScenario)
  const addMovement = usePlanStore((s) => s.addMovement)
  const addRecurring = usePlanStore((s) => s.addRecurring)
  const updateMovement = usePlanStore((s) => s.updateMovement)
  const deleteMovement = usePlanStore((s) => s.deleteMovement)
  const deleteSeriesFrom = usePlanStore((s) => s.deleteSeriesFrom)
  const toggleIncluded = usePlanStore((s) => s.toggleIncluded)
  const setRealBalance = usePlanStore((s) => s.setRealBalance)
  const lowBalanceThreshold = usePlanStore((s) => s.lowBalanceThreshold)
  const addCard = usePlanStore((s) => s.addCard)
  const updateCard = usePlanStore((s) => s.updateCard)
  const deleteCard = usePlanStore((s) => s.deleteCard)
  const addDebitAccount = usePlanStore((s) => s.addDebitAccount)
  const updateDebitAccount = usePlanStore((s) => s.updateDebitAccount)
  const deleteDebitAccount = usePlanStore((s) => s.deleteDebitAccount)

  const computed = useComputed()
  const cashStateById = useMemo(
    () => new Map(computed.cashStates.map((c) => [c.id, c])),
    [computed],
  )
  // saldo corriente del POOL que tocó cada movimiento (efectivo o suma de débitos), sin combinar
  const poolById = useMemo(() => {
    const debitIds = new Set(debitAccounts.map((d) => d.id))
    const m = new Map<ID, PoolBal>()
    for (const p of computed.points) {
      const mv = p.movement
      const touched = mv.kind === 'anchor' ? (mv.accountId ?? LIQUID) : p.paidFrom
      if (!touched) continue
      if (touched === LIQUID) {
        m.set(mv.id, { balance: p.cashAfter[LIQUID] ?? 0, kind: 'efectivo' })
      } else if (debitIds.has(touched)) {
        let s = 0
        for (const d of debitAccounts) s += p.cashAfter[d.id] ?? 0
        m.set(mv.id, { balance: s, kind: 'debito' })
      }
    }
    return m
  }, [computed, debitAccounts])
  const debitCardsView = useMemo<DebitCardView[]>(
    () =>
      debitAccounts.map((d) => ({
        id: d.id,
        name: d.name,
        color: d.color,
        balance: cashStateById.get(d.id)?.balance ?? 0,
        blocked: cashStateById.get(d.id)?.blocked ?? false,
      })),
    [debitAccounts, cashStateById],
  )
  const paidFromById = useMemo(
    () =>
      new Map(computed.points.filter((p) => p.paidFrom).map((p) => [p.movement.id, p.paidFrom!])),
    [computed],
  )
  const summaryByWeek = useMemo(
    () => new Map(computed.weeks.map((w) => [w.key.weekStart, w])),
    [computed],
  )
  const accountsById = useMemo(
    () =>
      new Map<ID, AccountMeta>([
        [LIQUID, { name: EFECTIVO_NAME, color: '#141414', kind: 'cash' }],
        ...debitAccounts.map((d) => [d.id, { name: d.name, color: d.color, kind: 'debit' }] as const),
        ...creditCards.map((c) => [c.id, { name: c.name, color: c.color, kind: 'credit' }] as const),
      ]),
    [debitAccounts, creditCards],
  )
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

  // semana en curso (según hoy) → las anteriores se ocultan y quedan bloqueadas
  const currentWeek = useMemo(() => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return mondayOf(iso)
  }, [])
  const pastWeeks = useMemo(() => shownWeeks.filter((w) => w < currentWeek), [shownWeeks, currentWeek])
  const visibleWeeks = useMemo(
    () => shownWeeks.filter((w) => w >= currentWeek),
    [shownWeeks, currentWeek],
  )
  const editableWeeks = useMemo(() => {
    const future = allWeeks.filter((w) => w >= currentWeek)
    return future.length ? future : allWeeks
  }, [allWeeks, currentWeek])
  const nextNewWeek = useMemo(() => {
    const last = shownWeeks.length ? shownWeeks[shownWeeks.length - 1] : currentWeek
    return addDays(last > currentWeek ? last : currentWeek, 7)
  }, [shownWeeks, currentWeek])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Movement | null>(null)
  const [defaultWeek, setDefaultWeek] = useState<ISODate | undefined>(undefined)
  const [defaultMode, setDefaultMode] = useState<SheetMode | undefined>(undefined)
  const [cardSheetOpen, setCardSheetOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [debitSheetOpen, setDebitSheetOpen] = useState(false)
  const [editingDebit, setEditingDebit] = useState<DebitAccount | null>(null)
  const [showPast, setShowPast] = useState(false)

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
    if (data.recurrence && !editing) {
      await addRecurring({
        name: data.name,
        amount: data.amount,
        categoryId: data.categoryId,
        cashEligible: data.cashEligible,
        debitEligible: data.debitEligible,
        creditEligible: data.creditEligible,
        paidWith: data.paidWith,
        rule: data.recurrence,
      })
      return
    }
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
        cashEligible: data.cashEligible,
        debitEligible: data.debitEligible,
        creditEligible: data.creditEligible,
        paidWith: data.paidWith,
        payCardId: data.payCardId,
        cardBlock: data.cardBlock,
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

  function handleSaveDebit(d: { id?: ID; name: string }) {
    if (d.id) {
      const existing = debitAccounts.find((x) => x.id === d.id)
      if (existing) void updateDebitAccount({ ...existing, name: d.name })
    } else {
      void addDebitAccount(d.name)
    }
  }

  function confirmDeleteScenario(id: ID, name: string) {
    if (window.confirm(`¿Borrar el escenario "${name}"? Esto no se puede deshacer.`)) {
      void deleteScenario(id)
    }
  }

  function renderWeek(ws: ISODate, readOnly: boolean) {
    const summary = summaryByWeek.get(ws)
    const rows = weekMap.get(ws) ?? []
    return (
      <section
        key={ws}
        className={cn(
          'overflow-hidden rounded-chunky border-2 border-line bg-surface shadow-hard',
          readOnly && 'opacity-75',
        )}
      >
        <header className="border-b-2 border-line bg-canvas px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-baseline gap-1.5 font-display text-sm font-bold uppercase tracking-wide">
              <span>{weekRangeLabel(ws)}</span>
              <span className="text-[10px] font-semibold text-muted">{parseISO(ws).y}</span>
              {readOnly && <Lock size={11} className="self-center text-muted" />}
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

        <ul className="divide-y divide-line/10">
          {rows.map((mv) => (
            <MovementRow
              key={mv.id}
              mv={mv}
              pool={poolById.get(mv.id)}
              paidFrom={paidFromById.get(mv.id)}
              category={categories.find((c) => c.id === mv.categoryId)}
              accountsById={accountsById}
              readOnly={readOnly}
              onEdit={readOnly ? undefined : () => openEdit(mv)}
              onToggle={readOnly ? undefined : () => toggleIncluded(mv.id)}
            />
          ))}
        </ul>

        {!readOnly && (
          <div className="flex items-center gap-1 border-t-2 border-line/10 p-1.5">
            <button
              onClick={() => openNew(ws)}
              className="flex-1 rounded-lg py-2 text-sm font-semibold text-muted active:bg-canvas"
            >
              + Movimiento
            </button>
            <button
              onClick={() => openNew(ws, 'real')}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-muted active:bg-canvas"
            >
              <Anchor size={14} /> Saldo real
            </button>
          </div>
        )}
      </section>
    )
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
                'flex shrink-0 items-center rounded-chunky border-2 border-line',
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
          className="shrink-0 rounded-chunky border-2 border-line bg-surface p-2 active:translate-y-0.5"
        >
          <Copy size={16} />
        </button>
      </div>

      <Hero computed={computed} threshold={lowBalanceThreshold} />

      <DebitStrip
        cards={debitCardsView}
        onAdd={() => {
          setEditingDebit(null)
          setDebitSheetOpen(true)
        }}
        onEdit={(id) => {
          setEditingDebit(debitAccounts.find((d) => d.id === id) ?? null)
          setDebitSheetOpen(true)
        }}
      />

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

      {pastWeeks.length > 0 && (
        <div className="space-y-4">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-2.5 text-sm font-semibold text-muted active:bg-surface"
          >
            {showPast ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showPast ? 'Ocultar' : 'Ver'} {pastWeeks.length}{' '}
            {pastWeeks.length === 1 ? 'semana pasada' : 'semanas pasadas'}
            <Lock size={12} />
          </button>
          {showPast && (
            <div className="space-y-4">{pastWeeks.map((ws) => renderWeek(ws, true))}</div>
          )}
        </div>
      )}

      <div className="space-y-4">{visibleWeeks.map((ws) => renderWeek(ws, false))}</div>

      <button
        onClick={() => openNew(nextNewWeek)}
        className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-3 text-sm font-semibold text-muted active:bg-surface"
      >
        <Plus size={16} /> Planear una semana más ({weekRangeLabel(nextNewWeek)})
      </button>

      <button
        onClick={() => openNew()}
        aria-label="Agregar movimiento"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 border-line bg-accent text-ink shadow-hard-lg transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm"
      >
        <Plus size={26} />
      </button>

      <MovementSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        movement={editing}
        defaultWeek={defaultWeek}
        defaultMode={defaultMode}
        weeks={editableWeeks}
        categories={categories}
        cards={creditCards}
        debitAccounts={debitAccounts}
        onSubmit={handleSubmit}
        onDelete={deleteMovement}
        onDeleteFollowing={(mv) => void deleteSeriesFrom(mv)}
      />
      <CardSheet
        open={cardSheetOpen}
        onOpenChange={setCardSheetOpen}
        card={editingCard}
        onSave={handleSaveCard}
        onDelete={(id) => void deleteCard(id)}
      />
      <DebitSheet
        open={debitSheetOpen}
        onOpenChange={setDebitSheetOpen}
        account={editingDebit}
        onSave={handleSaveDebit}
        onDelete={(id) => void deleteDebitAccount(id)}
      />
    </div>
  )
}

function Hero({ computed, threshold }: { computed: ComputedScenario; threshold: number }) {
  const alertWeek = computed.weeks.find((w) => w.lowestBalance < threshold)
  const efectivo = computed.cashStates.find((c) => c.id === LIQUID)?.balance ?? 0
  const debito = computed.cashStates
    .filter((c) => c.kind === 'debit')
    .reduce((a, c) => a + c.balance, 0)
  const hasDebit = computed.cashStates.some((c) => c.kind === 'debit')
  return (
    <div className="rounded-chunky border-2 border-line bg-ink p-5 text-paper shadow-hard">
      {hasDebit ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-paper/60">Efectivo</p>
            <Money cents={efectivo} className="mt-0.5 block text-3xl font-bold text-paper" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-paper/60">Débito</p>
            <Money cents={debito} className="mt-0.5 block text-3xl font-bold text-paper" />
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-paper/60">
            Saldo líquido final
          </p>
          <Money cents={efectivo} className="mt-1 block text-4xl font-bold text-paper" />
        </>
      )}
      <div className="mt-2 text-sm text-paper/70">
        punto más bajo <Money cents={computed.minBalance} className="text-paper" />
      </div>
      <div
        className={cn(
          'mt-3 inline-block rounded-full border-2 px-3 py-1 text-xs font-bold',
          alertWeek ? 'border-neg bg-neg text-white' : 'border-accent bg-accent text-ink',
        )}
      >
        {alertWeek
          ? `⚠ Baja a ${formatMXNCompact(alertWeek.lowestBalance)} · ${alertWeek.key.label}`
          : threshold > 0
            ? `Siempre arriba de ${formatMXNCompact(threshold)} ✓`
            : 'Nunca te quedas en rojo ✓'}
      </div>
    </div>
  )
}

function DebitStrip({
  cards,
  onAdd,
  onEdit,
}: {
  cards: DebitCardView[]
  onAdd: () => void
  onEdit: (id: ID) => void
}) {
  if (cards.length === 0) {
    return (
      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-3 text-sm font-semibold text-muted active:bg-surface"
      >
        <Wallet size={16} /> Agregar tarjeta de débito
      </button>
    )
  }
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4">
      {cards.map((c) => (
        <button
          key={c.id}
          onClick={() => onEdit(c.id)}
          className="w-40 shrink-0 rounded-chunky border-2 border-line bg-surface p-3 text-left shadow-hard-sm"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
            <span className="truncate text-sm font-bold">{c.name}</span>
            {c.blocked && <Lock size={12} className="shrink-0 text-muted" />}
          </div>
          <Money
            cents={c.balance}
            className={cn('mt-2 block text-lg font-bold', c.balance < 0 && 'text-neg')}
          />
          <span className="text-[11px] text-muted">{c.blocked ? 'apagada' : 'disponible'}</span>
        </button>
      ))}
      <button
        onClick={onAdd}
        aria-label="Agregar tarjeta de débito"
        className="grid w-12 shrink-0 place-items-center rounded-chunky border-2 border-dashed border-line/40 active:bg-surface"
      >
        <Plus size={18} />
      </button>
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
        className="flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-3 text-sm font-semibold text-muted active:bg-surface"
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
            className="w-44 shrink-0 rounded-chunky border-2 border-line bg-surface p-3 text-left shadow-hard-sm"
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: card.color }} />
              <span className="truncate text-sm font-bold">{card.name}</span>
              {blocked && <Lock size={12} className="shrink-0 text-muted" />}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full border border-line bg-canvas">
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
        className="grid w-12 shrink-0 place-items-center rounded-chunky border-2 border-dashed border-line/40 active:bg-surface"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}

interface RowProps {
  mv: Movement
  pool?: PoolBal
  paidFrom?: ID
  category?: Category
  accountsById: Map<ID, AccountMeta>
  readOnly?: boolean
  onEdit?: () => void
  onToggle?: () => void
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

function MovementRow({
  mv,
  pool,
  paidFrom,
  category,
  accountsById,
  readOnly,
  onEdit,
  onToggle,
}: RowProps) {
  const meta = TYPE_META[movementType(mv)]
  const isBlock = !!mv.cardBlock
  const Icon = isBlock ? (mv.cardBlock!.blocked ? Lock : Unlock) : meta.Icon
  const isAnchor = mv.kind === 'anchor'
  const acctOf = (id?: ID) => (id ? accountsById.get(id) : undefined)
  const anchorAcct = isAnchor && mv.accountId && mv.accountId !== LIQUID ? acctOf(mv.accountId) : undefined
  const isCreditAnchor = anchorAcct?.kind === 'credit'
  const blockAcct = isBlock ? acctOf(mv.cardBlock!.cardId) : undefined
  const payAcct = mv.payCardId ? acctOf(mv.payCardId) : undefined
  // de qué cuenta salió el gasto (si no fue efectivo)
  const paidAcct = !isAnchor && !mv.payCardId && paidFrom && paidFrom !== LIQUID ? acctOf(paidFrom) : undefined

  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-2.5',
        isAnchor && 'bg-accent/10',
        isBlock && 'bg-fg/5',
        !mv.included && 'opacity-40',
      )}
    >
      {/* badge de tipo (ingreso · gasto · pago · saldo real · bloqueo) — también prende/apaga */}
      <button onClick={onToggle} aria-label={mv.included ? 'Excluir' : 'Incluir'} className="shrink-0">
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border-2 border-line',
            mv.included ? `${meta.bg} shadow-hard-sm` : 'bg-surface',
          )}
        >
          <Icon size={15} strokeWidth={2.75} className={mv.included ? meta.fg : 'text-muted'} />
        </span>
      </button>

      <button
        onClick={onEdit}
        className={cn(
          'flex flex-1 items-center justify-between gap-2 text-left',
          readOnly && 'cursor-default',
        )}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {category && !isAnchor && !isBlock && (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: category.color }} />
            )}
            <span className="truncate font-medium leading-tight">{mv.name}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 empty:hidden">
            {mv.date && (
              <span className="font-mono text-[11px] tabular-nums text-muted">
                {dayLabel(mv.date)}
              </span>
            )}
            {mv.source?.kind === 'recurrence' && (
              <Repeat size={11} className="text-muted" aria-label="recurrente" />
            )}
            {anchorAcct && <Tag color="bg-accent text-ink">saldo {anchorAcct.name}</Tag>}
            {paidAcct && (
              <Tag color={paidAcct.kind === 'credit' ? 'bg-cobalt text-white' : 'bg-ink text-paper'}>
                {paidAcct.kind === 'credit' ? `→ crédito ${paidAcct.name}` : `→ ${paidAcct.name}`}
              </Tag>
            )}
            {payAcct && <Tag color="bg-ink text-paper">{payAcct.name}</Tag>}
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
          {!isCreditAnchor && !isBlock && mv.included && pool && (
            <span className="block text-xs text-muted">
              {pool.kind === 'debito' && <span className="mr-0.5 opacity-70">déb</span>}
              <Money cents={pool.balance} />
            </span>
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
