import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CreditCard as CardIcon, Lock, Pencil, Plus, Wallet } from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { Money } from '../components/Money'
import { CardSheet } from './CardSheet'
import { DebitSheet } from './DebitSheet'
import type { CreditCard, DebitAccount, ID } from '../../domain/types'
import { LIQUID } from '../../domain/types'
import { cn } from '../../lib/cn'

export function CuentasScreen() {
  const debitAccounts = usePlanStore((s) => s.debitAccounts)
  const creditCards = usePlanStore((s) => s.creditCards)
  const addDebitAccount = usePlanStore((s) => s.addDebitAccount)
  const updateDebitAccount = usePlanStore((s) => s.updateDebitAccount)
  const deleteDebitAccount = usePlanStore((s) => s.deleteDebitAccount)
  const moveDebitAccount = usePlanStore((s) => s.moveDebitAccount)
  const addCard = usePlanStore((s) => s.addCard)
  const updateCard = usePlanStore((s) => s.updateCard)
  const deleteCard = usePlanStore((s) => s.deleteCard)
  const moveCard = usePlanStore((s) => s.moveCard)

  const computed = useComputed()
  const cashById = useMemo(() => new Map(computed.cashStatesToday.map((c) => [c.id, c])), [computed])
  const cardStateById = useMemo(
    () => new Map(computed.cardStatesToday.map((c) => [c.card.id, c])),
    [computed],
  )
  const efectivo = cashById.get(LIQUID)

  const [debitSheet, setDebitSheet] = useState(false)
  const [editingDebit, setEditingDebit] = useState<DebitAccount | null>(null)
  const [cardSheet, setCardSheet] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)

  function saveDebit(d: { id?: ID; name: string }) {
    if (d.id) {
      const existing = debitAccounts.find((x) => x.id === d.id)
      if (existing) void updateDebitAccount({ ...existing, name: d.name })
    } else void addDebitAccount(d.name)
  }
  function saveCard(d: { id?: ID; name: string; limit: number }) {
    if (d.id) {
      const existing = creditCards.find((c) => c.id === d.id)
      if (existing) void updateCard({ ...existing, name: d.name, limit: d.limit })
    } else void addCard(d.name, d.limit)
  }

  return (
    <div className="space-y-6 pb-28">
      <p className="px-1 text-sm text-muted">
        Un gasto se paga con la primera cuenta <b>permitida</b> y <b>encendida</b> de esta jerarquía que
        alcance: <b>efectivo → débitos → créditos</b> (de arriba hacia abajo). Ordénalas como priorizas.
      </p>

      {/* LIQUIDEZ */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 font-display text-sm font-bold uppercase tracking-wide">
          <Wallet size={15} /> Liquidez
        </h2>

        {/* efectivo (fijo, siempre primero) */}
        <div className="flex items-center gap-3 rounded-chunky border-2 border-line bg-surface p-3 shadow-hard-sm">
          <span className="h-3 w-3 shrink-0 rounded-full bg-ink" />
          <div className="min-w-0 flex-1">
            <div className="font-bold">Efectivo</div>
            <Money cents={efectivo?.balance ?? 0} className="text-sm text-muted" />
          </div>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
            1º
          </span>
        </div>

        {debitAccounts.map((d, i) => {
          const st = cashById.get(d.id)
          return (
            <AccountRow
              key={d.id}
              color={d.color}
              name={d.name}
              rank={i + 2}
              blocked={st?.blocked}
              sub={<Money cents={st?.balance ?? 0} className="text-sm text-muted" />}
              onUp={i > 0 ? () => void moveDebitAccount(d.id, -1) : undefined}
              onDown={i < debitAccounts.length - 1 ? () => void moveDebitAccount(d.id, 1) : undefined}
              onEdit={() => {
                setEditingDebit(d)
                setDebitSheet(true)
              }}
            />
          )
        })}

        <AddButton
          label="Agregar tarjeta de débito"
          onClick={() => {
            setEditingDebit(null)
            setDebitSheet(true)
          }}
        />
      </section>

      {/* CRÉDITO */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 font-display text-sm font-bold uppercase tracking-wide">
          <CardIcon size={15} /> Crédito
        </h2>

        {creditCards.map((c, i) => {
          const st = cardStateById.get(c.id)
          return (
            <AccountRow
              key={c.id}
              color={c.color}
              name={c.name}
              rank={i + 1}
              blocked={st?.blocked}
              sub={
                <span className="flex gap-3 text-sm">
                  <span className="text-neg">
                    debe <Money cents={st?.debt ?? 0} />
                  </span>
                  <span className="text-pos">
                    <Money cents={st?.available ?? c.limit} /> libre
                  </span>
                </span>
              }
              onUp={i > 0 ? () => void moveCard(c.id, -1) : undefined}
              onDown={i < creditCards.length - 1 ? () => void moveCard(c.id, 1) : undefined}
              onEdit={() => {
                setEditingCard(c)
                setCardSheet(true)
              }}
            />
          )
        })}

        <AddButton
          label="Agregar tarjeta de crédito"
          onClick={() => {
            setEditingCard(null)
            setCardSheet(true)
          }}
        />
      </section>

      <DebitSheet
        open={debitSheet}
        onOpenChange={setDebitSheet}
        account={editingDebit}
        onSave={saveDebit}
        onDelete={(id) => void deleteDebitAccount(id)}
      />
      <CardSheet
        open={cardSheet}
        onOpenChange={setCardSheet}
        card={editingCard}
        onSave={saveCard}
        onDelete={(id) => void deleteCard(id)}
      />
    </div>
  )
}

function AccountRow({
  color,
  name,
  rank,
  blocked,
  sub,
  onUp,
  onDown,
  onEdit,
}: {
  color: string
  name: string
  rank: number
  blocked?: boolean
  sub: React.ReactNode
  onUp?: () => void
  onDown?: () => void
  onEdit: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-chunky border-2 border-line bg-surface p-3 shadow-hard-sm">
      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-bold">
          <span className="truncate">{name}</span>
          {blocked && <Lock size={13} className="shrink-0 text-muted" />}
        </div>
        {sub}
      </div>
      <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
        {rank}º
      </span>
      <div className="flex flex-col">
        <button
          onClick={onUp}
          disabled={!onUp}
          aria-label="Subir prioridad"
          className="text-muted active:text-fg disabled:opacity-25"
        >
          <ChevronUp size={18} />
        </button>
        <button
          onClick={onDown}
          disabled={!onDown}
          aria-label="Bajar prioridad"
          className="text-muted active:text-fg disabled:opacity-25"
        >
          <ChevronDown size={18} />
        </button>
      </div>
      <button
        onClick={onEdit}
        aria-label="Editar"
        className="rounded-lg border-2 border-line bg-surface p-2 active:translate-y-0.5"
      >
        <Pencil size={15} />
      </button>
    </div>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-chunky border-2 border-dashed border-line/40 py-3 text-sm font-semibold text-muted active:bg-surface',
      )}
    >
      <Plus size={16} /> {label}
    </button>
  )
}
