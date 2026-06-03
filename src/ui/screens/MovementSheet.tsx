import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Trash2 } from 'lucide-react'
import type { Category, Cents, CreditCard, ID, ISODate, Movement, MovementKind } from '../../domain/types'
import { LIQUID } from '../../domain/types'
import { addDays, mondayOf, parseISO, weekRangeLabel } from '../../domain/dates'
import { fromCents, toCents } from '../../domain/money'
import { cn } from '../../lib/cn'

export type SheetMode = 'gasto' | 'ingreso' | 'pago' | 'real' | 'bloqueo'

export interface MovementSubmit {
  kind: MovementKind
  name: string
  amount: Cents
  weekStart?: ISODate
  date?: ISODate
  categoryId?: ID
  creditEligible?: boolean
  payCardId?: ID
  accountId?: ID
  cardBlock?: { cardId: ID; blocked: boolean }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  movement?: Movement | null
  defaultWeek?: ISODate
  defaultMode?: SheetMode
  weeks: ISODate[]
  categories: Category[]
  cards: CreditCard[]
  onSubmit: (data: MovementSubmit) => void
  onDelete?: (id: ID) => void
}

const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function modeOf(m: Movement | null | undefined): SheetMode {
  if (!m) return 'gasto'
  if (m.cardBlock) return 'bloqueo'
  if (m.kind === 'anchor') return 'real'
  if (m.payCardId) return 'pago'
  return m.amount >= 0 ? 'ingreso' : 'gasto'
}

const LABELS: Record<SheetMode, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  pago: 'Pago tarjeta',
  real: 'Saldo real',
  bloqueo: 'Bloqueo',
}
const ACTIVE_CLS: Record<SheetMode, string> = {
  gasto: 'bg-neg text-white',
  ingreso: 'bg-pos text-white',
  pago: 'bg-cobalt text-white',
  real: 'bg-accent text-ink',
  bloqueo: 'bg-ink text-white',
}

export function MovementSheet({
  open,
  onOpenChange,
  movement,
  defaultWeek,
  defaultMode,
  weeks,
  categories,
  cards,
  onSubmit,
  onDelete,
}: Props) {
  const [mode, setMode] = useState<SheetMode>('gasto')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [week, setWeek] = useState<ISODate>('')
  const [date, setDate] = useState<string>('')
  const [categoryId, setCategoryId] = useState<ID | undefined>(undefined)
  const [creditEligible, setCreditEligible] = useState(false)
  const [payCardId, setPayCardId] = useState<ID | undefined>(undefined)
  const [account, setAccount] = useState<ID>(LIQUID)
  const [blockOn, setBlockOn] = useState(true)

  useEffect(() => {
    if (!open) return
    const m = movement ?? null
    setMode(defaultMode ?? modeOf(m))
    setName(m?.name ?? '')
    setAmount(m ? String(Math.abs(fromCents(m.amount))) : '')
    setWeek(m?.weekStart ?? (m?.date ? mondayOf(m.date) : (defaultWeek ?? weeks[0] ?? '')))
    setDate(m?.date ?? '')
    setCategoryId(m?.categoryId)
    setCreditEligible(m?.creditEligible ?? false)
    setPayCardId(m?.payCardId ?? m?.cardBlock?.cardId ?? cards[0]?.id)
    setAccount(m?.accountId ?? LIQUID)
    setBlockOn(m?.cardBlock?.blocked ?? true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const weekDays = useMemo(
    () => (week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : []),
    [week],
  )

  const modes: SheetMode[] = [
    'gasto',
    'ingreso',
    ...(cards.length ? (['pago'] as SheetMode[]) : []),
    'real',
    ...(cards.length ? (['bloqueo'] as SheetMode[]) : []),
  ]
  const isReal = mode === 'real'
  const isPago = mode === 'pago'
  const isBloqueo = mode === 'bloqueo'
  const cardName = (id?: ID) => cards.find((c) => c.id === id)?.name ?? 'tarjeta'

  const canSave = isBloqueo
    ? !!payCardId
    : amount !== '' &&
      !Number.isNaN(Number(amount)) &&
      (isReal || isPago || name.trim() !== '') &&
      (!isPago || !!payCardId)

  function changeMode(next: SheetMode) {
    setMode(next)
    if (next === 'real') setDate('')
  }

  function submit() {
    if (!canSave) return
    const wk = date && !isReal ? mondayOf(date) : week || undefined
    if (isBloqueo) {
      onSubmit({
        kind: 'delta',
        name: `${blockOn ? 'Bloquear' : 'Reactivar'} ${cardName(payCardId)}`,
        amount: 0,
        cardBlock: { cardId: payCardId as ID, blocked: blockOn },
        weekStart: wk,
        date: date || undefined,
      })
    } else if (isReal) {
      onSubmit({
        kind: 'anchor',
        name: name.trim() || (account === LIQUID ? 'Saldo real' : `Saldo ${cardName(account)}`),
        amount: toCents(Math.abs(Number(amount))),
        accountId: account,
        weekStart: week || undefined,
      })
    } else if (isPago) {
      onSubmit({
        kind: 'delta',
        name: name.trim() || `Pago ${cardName(payCardId)}`,
        amount: -toCents(Math.abs(Number(amount))),
        payCardId,
        weekStart: wk,
        date: date || undefined,
      })
    } else {
      const cents = toCents(Math.abs(Number(amount)))
      onSubmit({
        kind: 'delta',
        name: name.trim(),
        amount: mode === 'gasto' ? -cents : cents,
        weekStart: wk,
        date: date || undefined,
        categoryId,
        creditEligible: mode === 'gasto' ? creditEligible : undefined,
      })
    }
    onOpenChange(false)
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-md flex-col overflow-y-auto rounded-t-[22px] border-2 border-ink bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-ink/20" />
          <div className="space-y-3.5 p-5">
            <Drawer.Title className="font-display text-xl font-bold">
              {movement ? 'Editar movimiento' : 'Nuevo movimiento'}
            </Drawer.Title>
            <Drawer.Description className="sr-only">Formulario de movimiento</Drawer.Description>

            <div className="grid grid-cols-2 gap-2">
              {modes.map((mo) => (
                <button
                  key={mo}
                  onClick={() => changeMode(mo)}
                  className={cn(
                    'rounded-chunky border-2 border-ink py-2 text-sm font-bold transition-transform active:translate-y-0.5',
                    mode === mo ? ACTIVE_CLS[mo] + ' shadow-hard-sm' : 'bg-surface text-ink',
                  )}
                >
                  {LABELS[mo]}
                </button>
              ))}
            </div>

            {isBloqueo ? (
              <>
                <Chips
                  label="¿Qué tarjeta?"
                  options={cards}
                  value={payCardId}
                  onChange={setPayCardId}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBlockOn(true)}
                    className={cn(
                      'rounded-chunky border-2 border-ink py-2 text-sm font-bold active:translate-y-0.5',
                      blockOn ? 'bg-ink text-paper shadow-hard-sm' : 'bg-surface',
                    )}
                  >
                    🔒 Bloquear
                  </button>
                  <button
                    onClick={() => setBlockOn(false)}
                    className={cn(
                      'rounded-chunky border-2 border-ink py-2 text-sm font-bold active:translate-y-0.5',
                      !blockOn ? 'bg-pos text-white shadow-hard-sm' : 'bg-surface',
                    )}
                  >
                    🔓 Reactivar
                  </button>
                </div>
                <p className="px-1 text-xs text-muted">
                  {blockOn
                    ? 'A partir de esta semana no saldrá dinero de la tarjeta (sí podrás pagarla).'
                    : 'A partir de esta semana la tarjeta vuelve a poder usarse.'}
                </p>
                <WeekDay
                  weeks={weeks}
                  week={week}
                  setWeek={setWeek}
                  date={date}
                  setDate={setDate}
                  days={weekDays}
                />
              </>
            ) : (
              <>
                <Field label="Concepto">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      isReal ? 'Saldo real' : isPago ? `Pago ${cardName(payCardId)}` : 'Gasolina, Don René…'
                    }
                    autoFocus={!movement}
                    className="w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
                  />
                </Field>

                <Field
                  label={
                    isReal
                      ? account === LIQUID
                        ? 'Saldo real líquido (tu dinero)'
                        : `Deuda real de ${cardName(account)}`
                      : isPago
                        ? 'Cuánto abonas'
                        : 'Monto'
                  }
                >
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-lg text-muted">$</span>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                      inputMode="decimal"
                      placeholder="0"
                      className="tnum w-full bg-transparent font-mono text-lg outline-none placeholder:text-muted/60"
                    />
                  </div>
                </Field>

                {isReal && (
                  <Chips
                    label="¿De qué cuenta?"
                    options={[{ id: LIQUID, name: 'Líquido', color: '#141414' }, ...cards]}
                    value={account}
                    onChange={setAccount}
                  />
                )}
                {isPago && (
                  <Chips
                    label="¿Qué tarjeta pagas?"
                    options={cards}
                    value={payCardId}
                    onChange={setPayCardId}
                  />
                )}

                {isReal ? (
                  <>
                    <Field label="Semana">
                      <select
                        value={week}
                        onChange={(e) => setWeek(e.target.value)}
                        className="w-full bg-transparent text-base outline-none"
                      >
                        {weeks.map((w) => (
                          <option key={w} value={w}>
                            {weekRangeLabel(w)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <p className="px-1 text-xs text-muted">
                      El saldo real se fija al inicio de la semana seleccionada.
                    </p>
                  </>
                ) : (
                  <WeekDay
                    weeks={weeks}
                    week={week}
                    setWeek={setWeek}
                    date={date}
                    setDate={setDate}
                    days={weekDays}
                  />
                )}

                {mode === 'gasto' && cards.length > 0 && (
                  <button
                    onClick={() => setCreditEligible((v) => !v)}
                    className="flex w-full items-center justify-between rounded-chunky border-2 border-ink bg-surface px-3 py-2.5 text-left"
                  >
                    <span className="text-sm font-semibold">¿Pagable con tarjeta de crédito?</span>
                    <span
                      className={cn(
                        'flex h-6 w-11 items-center rounded-full border-2 border-ink p-0.5 transition-colors',
                        creditEligible ? 'bg-accent' : 'bg-surface',
                      )}
                    >
                      <span
                        className={cn(
                          'h-4 w-4 rounded-full bg-ink transition-transform',
                          creditEligible && 'translate-x-5',
                        )}
                      />
                    </span>
                  </button>
                )}

                {(mode === 'gasto' || mode === 'ingreso') && categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold',
                          categoryId === c.id ? 'bg-ink text-paper' : 'bg-surface',
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 pt-1">
              {movement && onDelete && (
                <button
                  onClick={() => {
                    onDelete(movement.id)
                    onOpenChange(false)
                  }}
                  aria-label="Eliminar"
                  className="flex items-center justify-center rounded-chunky border-2 border-ink bg-surface px-4 py-3 text-neg active:translate-y-0.5"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={submit}
                disabled={!canSave}
                className="flex-1 rounded-chunky border-2 border-ink bg-accent py-3 text-base font-bold text-ink shadow-hard transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm disabled:opacity-40"
              >
                {movement ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function WeekDay({
  weeks,
  week,
  setWeek,
  date,
  setDate,
  days,
}: {
  weeks: ISODate[]
  week: ISODate
  setWeek: (w: ISODate) => void
  date: string
  setDate: (d: string) => void
  days: ISODate[]
}) {
  return (
    <>
      <Field label="Semana">
        <select
          value={week}
          onChange={(e) => {
            setWeek(e.target.value)
            setDate('')
          }}
          className="w-full bg-transparent text-base outline-none"
        >
          {weeks.map((w) => (
            <option key={w} value={w}>
              {weekRangeLabel(w)}
            </option>
          ))}
        </select>
      </Field>
      <div>
        <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Día (opcional)
        </span>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const active = date === d
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(active ? '' : d)}
                className={cn(
                  'flex flex-col items-center rounded-lg border-2 border-ink py-1 transition-transform active:translate-y-0.5',
                  active ? 'bg-ink text-paper' : 'bg-surface',
                )}
              >
                <span className="text-[10px] font-semibold uppercase">{DOW[i]}</span>
                <span className="tnum font-mono text-sm">{parseISO(d).d}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function Chips({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: ID; name: string; color: string }[]
  value?: ID
  onChange: (id: ID) => void
}) {
  return (
    <div>
      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-1 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-sm font-semibold',
              value === o.id ? 'bg-ink text-paper' : 'bg-surface',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
            {o.name}
          </button>
        ))}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-chunky border-2 border-ink bg-surface px-3 py-2 focus-within:shadow-hard-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
