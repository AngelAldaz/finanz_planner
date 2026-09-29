import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  CreditCard as CardIcon,
  Lock,
  Pencil,
  PiggyBank,
  Plus,
  Ticket,
  Wallet,
} from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useComputed } from '../../state/hooks'
import { Money } from '../components/Money'
import { CardSheet } from './CardSheet'
import { DebitSheet } from './DebitSheet'
import { VoucherSheet } from './VoucherSheet'
import { EnvelopeSheet } from './EnvelopeSheet'
import type { CashState, CreditCard, DebitAccount, Envelope, ID, VoucherAccount } from '../../domain/types'
import { EFECTIVO_NAME, LIQUID } from '../../domain/types'
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
  const voucherAccounts = usePlanStore((s) => s.voucherAccounts)
  const addVoucherAccount = usePlanStore((s) => s.addVoucherAccount)
  const updateVoucherAccount = usePlanStore((s) => s.updateVoucherAccount)
  const deleteVoucherAccount = usePlanStore((s) => s.deleteVoucherAccount)
  const moveVoucherAccount = usePlanStore((s) => s.moveVoucherAccount)
  const envelopes = usePlanStore((s) => s.envelopes)
  const addEnvelope = usePlanStore((s) => s.addEnvelope)
  const updateEnvelope = usePlanStore((s) => s.updateEnvelope)
  const deleteEnvelope = usePlanStore((s) => s.deleteEnvelope)
  const moveEnvelope = usePlanStore((s) => s.moveEnvelope)

  const computed = useComputed()
  const cashById = useMemo(() => new Map(computed.cashStatesToday.map((c) => [c.id, c])), [computed])
  const cardStateById = useMemo(
    () => new Map(computed.cardStatesToday.map((c) => [c.card.id, c])),
    [computed],
  )
  const efectivo = cashById.get(LIQUID)
  const voucherById = useMemo(
    () => new Map(computed.voucherStatesToday.map((v) => [v.id, v])),
    [computed],
  )
  const envBalance = useMemo(
    () => new Map(computed.envelopeStatesToday.map((e) => [e.envelope.id, e.balance])),
    [computed],
  )

  const [debitSheet, setDebitSheet] = useState(false)
  const [editingDebit, setEditingDebit] = useState<DebitAccount | null>(null)
  const [cardSheet, setCardSheet] = useState(false)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [voucherSheet, setVoucherSheet] = useState(false)
  const [editingVoucher, setEditingVoucher] = useState<VoucherAccount | null>(null)
  const [envSheet, setEnvSheet] = useState(false)
  const [editingEnv, setEditingEnv] = useState<Envelope | null>(null)
  const [envAccountId, setEnvAccountId] = useState<ID>(LIQUID)
  const accountName = (id: ID) =>
    id === LIQUID ? EFECTIVO_NAME : (debitAccounts.find((d) => d.id === id)?.name ?? '?')
  function openEnvelope(accountId: ID, env: Envelope | null) {
    setEnvAccountId(accountId)
    setEditingEnv(env)
    setEnvSheet(true)
  }
  function saveEnvelope(d: { id?: ID; name: string }) {
    if (d.id) {
      const existing = envelopes.find((x) => x.id === d.id)
      if (existing) void updateEnvelope({ ...existing, name: d.name })
    } else void addEnvelope(envAccountId, d.name)
  }
  const envelopeListProps = (accountId: ID) => ({
    accountId,
    accountName: accountName(accountId),
    envelopes,
    balances: envBalance,
    onAdd: () => openEnvelope(accountId, null),
    onEdit: (e: Envelope) => openEnvelope(accountId, e),
    onMove: (id: ID, dir: -1 | 1) => void moveEnvelope(id, dir),
  })

  function saveDebit(d: { id?: ID; name: string }) {
    if (d.id) {
      const existing = debitAccounts.find((x) => x.id === d.id)
      if (existing) void updateDebitAccount({ ...existing, name: d.name })
    } else void addDebitAccount(d.name)
  }
  function saveVoucher(d: { id?: ID; name: string }) {
    if (d.id) {
      const existing = voucherAccounts.find((x) => x.id === d.id)
      if (existing) void updateVoucherAccount({ ...existing, name: d.name })
    } else void addVoucherAccount(d.name)
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
            <LiquiditySub st={efectivo} />
          </div>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
            1º
          </span>
        </div>
        <EnvelopeList {...envelopeListProps(LIQUID)} />

        {debitAccounts.map((d, i) => {
          const st = cashById.get(d.id)
          return (
            <div key={d.id} className="space-y-2">
              <AccountRow
                color={d.color}
                name={d.name}
                rank={i + 2}
                blocked={st?.blocked}
                sub={<LiquiditySub st={st} />}
                onUp={i > 0 ? () => void moveDebitAccount(d.id, -1) : undefined}
                onDown={
                  i < debitAccounts.length - 1 ? () => void moveDebitAccount(d.id, 1) : undefined
                }
                onEdit={() => {
                  setEditingDebit(d)
                  setDebitSheet(true)
                }}
              />
              <EnvelopeList {...envelopeListProps(d.id)} />
            </div>
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

      {/* VALES: fuera de la jerarquía, solo por asignación manual */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 px-1 font-display text-sm font-bold uppercase tracking-wide">
          <Ticket size={15} /> Vales
        </h2>
        <p className="px-1 text-xs text-muted">
          Aparte del líquido y <b>fuera de la jerarquía</b>: nada se paga con vales en automático. Un
          gasto sale de aquí solo si lo eliges en «Lo pagué con».
        </p>

        {voucherAccounts.map((v, i) => {
          const st = voucherById.get(v.id)
          return (
            <AccountRow
              key={v.id}
              color={v.color}
              name={v.name}
              sub={<Money cents={st?.balance ?? 0} className="text-sm text-muted" />}
              onUp={i > 0 ? () => void moveVoucherAccount(v.id, -1) : undefined}
              onDown={
                i < voucherAccounts.length - 1 ? () => void moveVoucherAccount(v.id, 1) : undefined
              }
              onEdit={() => {
                setEditingVoucher(v)
                setVoucherSheet(true)
              }}
            />
          )
        })}

        <AddButton
          label="Agregar tarjeta de vales"
          onClick={() => {
            setEditingVoucher(null)
            setVoucherSheet(true)
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
      <VoucherSheet
        open={voucherSheet}
        onOpenChange={setVoucherSheet}
        account={editingVoucher}
        onSave={saveVoucher}
        onDelete={(id) => void deleteVoucherAccount(id)}
      />
      <EnvelopeSheet
        open={envSheet}
        onOpenChange={setEnvSheet}
        envelope={editingEnv}
        accountName={accountName(envAccountId)}
        onSave={saveEnvelope}
        onDelete={(id) => void deleteEnvelope(id)}
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

/** "Libre $X · Apartado $Y" (o solo el saldo si la cuenta no tiene apartados). */
function LiquiditySub({ st }: { st?: CashState }) {
  if (!st) return <Money cents={0} className="text-sm text-muted" />
  if (!st.reserved) return <Money cents={st.balance} className="text-sm text-muted" />
  return (
    <span className="flex flex-wrap gap-x-3 text-sm">
      <span className="text-fg">
        libre <Money cents={st.free} className={cn(st.free < 0 && 'text-neg')} />
      </span>
      <span className="text-muted">
        apartado <Money cents={st.reserved} />
      </span>
    </span>
  )
}

/** Apartados de una cuenta de liquidez, anidados bajo su fila. */
function EnvelopeList({
  accountId,
  accountName,
  envelopes,
  balances,
  onAdd,
  onEdit,
  onMove,
}: {
  accountId: ID
  accountName: string
  envelopes: Envelope[]
  balances: Map<ID, number>
  onAdd: () => void
  onEdit: (e: Envelope) => void
  onMove: (id: ID, dir: -1 | 1) => void
}) {
  const list = envelopes
    .filter((e) => e.accountId === accountId)
    .sort((a, b) => a.position - b.position)
  return (
    <div className="ml-6 space-y-1.5">
      {list.map((e, i) => {
        const bal = balances.get(e.id) ?? 0
        return (
          <div
            key={e.id}
            className="flex items-center gap-2 rounded-chunky border-2 border-dotted border-line/70 bg-surface px-3 py-2"
          >
            <PiggyBank size={13} className="shrink-0 text-muted" />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.name}</span>
            <Money cents={bal} className={cn('text-sm', bal < 0 ? 'text-neg' : 'text-muted')} />
            <div className="flex flex-col">
              <button
                onClick={() => onMove(e.id, -1)}
                disabled={i === 0}
                aria-label="Subir apartado"
                className="text-muted active:text-fg disabled:opacity-25"
              >
                <ChevronUp size={16} />
              </button>
              <button
                onClick={() => onMove(e.id, 1)}
                disabled={i === list.length - 1}
                aria-label="Bajar apartado"
                className="text-muted active:text-fg disabled:opacity-25"
              >
                <ChevronDown size={16} />
              </button>
            </div>
            <button
              onClick={() => onEdit(e)}
              aria-label={`Editar apartado ${e.name}`}
              className="rounded-lg border-2 border-line bg-surface p-1.5 active:translate-y-0.5"
            >
              <Pencil size={13} />
            </button>
          </div>
        )
      })}
      <button
        onClick={onAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-chunky border-2 border-dotted border-line/40 py-1.5 text-xs font-semibold text-muted active:bg-surface"
      >
        <PiggyBank size={13} /> Apartado en {accountName}
      </button>
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
  rank?: number // sin rank = fuera de la jerarquía (vales)
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
      {rank !== undefined && (
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold uppercase text-muted">
          {rank}º
        </span>
      )}
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
