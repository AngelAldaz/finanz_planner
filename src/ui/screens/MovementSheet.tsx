import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Repeat, Trash2 } from 'lucide-react'
import type {
  Category,
  Cents,
  CreditCard,
  DebitAccount,
  ID,
  ISODate,
  Movement,
  MovementKind,
  RecurrenceRule,
  VoucherAccount,
  Envelope,
} from '../../domain/types'
import { EFECTIVO_NAME, LIQUID } from '../../domain/types'
import { addDays, mondayOf, parseISO, weekRangeLabel } from '../../domain/dates'
import { fromCents, toCents } from '../../domain/money'
import { PRESET_LABELS, recurrenceFromPreset, type RecurrencePreset } from '../../domain/recurrence'
import { cn } from '../../lib/cn'

export type SheetMode = 'gasto' | 'ingreso' | 'traspaso' | 'apartado' | 'pago' | 'real' | 'bloqueo'

export interface MovementSubmit {
  kind: MovementKind
  name: string
  amount: Cents
  weekStart?: ISODate
  date?: ISODate
  categoryId?: ID
  cashEligible?: boolean
  debitEligible?: boolean
  creditEligible?: boolean
  paidWith?: ID
  payCardId?: ID
  accountId?: ID
  cardBlock?: { cardId: ID; blocked: boolean }
  transfer?: { fromId: ID; toId: ID }
  recurrence?: RecurrenceRule
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
  debitAccounts: DebitAccount[]
  voucherAccounts?: VoucherAccount[]
  envelopes?: Envelope[]
  onSubmit: (data: MovementSubmit) => void
  onDelete?: (id: ID) => void
  onDeleteFollowing?: (movement: Movement) => void
}

const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']
const EFECTIVO_OPT = { id: LIQUID, name: EFECTIVO_NAME, color: '#141414' }

function modeOf(m: Movement | null | undefined, envelopes: Envelope[]): SheetMode {
  if (!m) return 'gasto'
  if (m.cardBlock) return 'bloqueo'
  if (m.kind === 'anchor') return 'real'
  if (m.transfer) {
    const isEnv = (id: ID) => envelopes.some((e) => e.id === id)
    return isEnv(m.transfer.fromId) || isEnv(m.transfer.toId) ? 'apartado' : 'traspaso'
  }
  if (m.payCardId) return 'pago'
  return m.amount >= 0 ? 'ingreso' : 'gasto'
}

const LABELS: Record<SheetMode, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  traspaso: 'Traspaso',
  apartado: 'Apartar',
  pago: 'Pago tarjeta',
  real: 'Saldo real',
  bloqueo: 'Apagar/Prender',
}
const ACTIVE_CLS: Record<SheetMode, string> = {
  gasto: 'bg-neg text-white',
  ingreso: 'bg-pos text-white',
  traspaso: 'bg-fg text-canvas',
  apartado: 'bg-[#9b51e0] text-white',
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
  debitAccounts,
  voucherAccounts = [],
  envelopes = [],
  onSubmit,
  onDelete,
  onDeleteFollowing,
}: Props) {
  const [mode, setMode] = useState<SheetMode>('gasto')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [week, setWeek] = useState<ISODate>('')
  const [date, setDate] = useState<string>('')
  const [categoryId, setCategoryId] = useState<ID | undefined>(undefined)
  const [cashEligible, setCashEligible] = useState(true)
  const [debitEligible, setDebitEligible] = useState(true)
  const [creditEligible, setCreditEligible] = useState(false)
  const [paidWith, setPaidWith] = useState<ID | undefined>(undefined)
  const [payCardId, setPayCardId] = useState<ID | undefined>(undefined)
  const [account, setAccount] = useState<ID>(LIQUID)
  const [transferFrom, setTransferFrom] = useState<ID>(LIQUID)
  const [transferTo, setTransferTo] = useState<ID | undefined>(undefined)
  // modo "Apartar": cuenta + apartado + dirección (apartar = cuenta → apartado; sacar = al revés)
  const [envAccount, setEnvAccount] = useState<ID>(LIQUID)
  const [envId, setEnvId] = useState<ID | undefined>(undefined)
  const [envDir, setEnvDir] = useState<'in' | 'out'>('in')
  const [blockOn, setBlockOn] = useState(true)
  const [repeat, setRepeat] = useState<RecurrencePreset>('once')
  const [deleteMode, setDeleteMode] = useState(false)

  const cashAccounts = useMemo(() => [EFECTIVO_OPT, ...debitAccounts], [debitAccounts])
  // cuentas donde puede ENTRAR un ingreso: liquidez + vales (una carga de vales es un ingreso)
  const incomeTargets = useMemo(
    () => [...cashAccounts, ...voucherAccounts],
    [cashAccounts, voucherAccounts],
  )
  const allAccounts = useMemo(
    () => [...cashAccounts, ...voucherAccounts, ...cards],
    [cashAccounts, voucherAccounts, cards],
  )
  const blockTargets = useMemo(() => [...debitAccounts, ...cards], [debitAccounts, cards])
  const envOf = (id?: ID) => envelopes.find((e) => e.id === id)
  /** cuenta "real" detrás de una selección: un apartado apunta a su cuenta dueña */
  const acctOfSel = (id?: ID) => envOf(id)?.accountId ?? id
  const envelopesFor = (acct?: ID) => envelopes.filter((e) => e.accountId === acct)
  const nameOf = (id?: ID): string => {
    const env = envOf(id)
    if (env) return `${nameOf(env.accountId)} · ${env.name}`
    return allAccounts.find((a) => a.id === id)?.name ?? EFECTIVO_NAME
  }
  const isCreditAccount = (id?: ID) => cards.some((c) => c.id === id)
  // cuentas de liquidez que tienen al menos un apartado (para el modo "Apartar")
  const accountsWithEnvelopes = useMemo(
    () => cashAccounts.filter((a) => envelopes.some((e) => e.accountId === a.id)),
    [cashAccounts, envelopes],
  )

  useEffect(() => {
    if (!open) return
    const m = movement ?? null
    setMode(defaultMode ?? modeOf(m, envelopes))
    setName(m?.name ?? '')
    setAmount(m ? String(Math.abs(fromCents(m.amount))) : '')
    setWeek(m?.weekStart ?? (m?.date ? mondayOf(m.date) : (defaultWeek ?? weeks[0] ?? '')))
    setDate(m?.date ?? '')
    setCategoryId(m?.categoryId)
    setCashEligible(m?.cashEligible ?? true)
    setDebitEligible(m?.debitEligible ?? true)
    setCreditEligible(m?.creditEligible ?? false)
    setPaidWith(m?.paidWith)
    setPayCardId(m?.payCardId ?? m?.cardBlock?.cardId ?? cards[0]?.id ?? blockTargets[0]?.id)
    setAccount(m?.accountId ?? LIQUID)
    setTransferFrom(m?.transfer?.fromId ?? LIQUID)
    setTransferTo(m?.transfer?.toId ?? debitAccounts[0]?.id)
    {
      const toEnv = envelopes.find((e) => e.id === m?.transfer?.toId)
      const fromEnv = envelopes.find((e) => e.id === m?.transfer?.fromId)
      const first = envelopes[0]
      const env = toEnv ?? fromEnv ?? first
      setEnvDir(fromEnv && !toEnv ? 'out' : 'in')
      setEnvAccount(env?.accountId ?? LIQUID)
      setEnvId(env?.id)
    }
    setBlockOn(m?.cardBlock?.blocked ?? true)
    setRepeat('once')
    setDeleteMode(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const weekDays = useMemo(
    () => (week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : []),
    [week],
  )

  const modes: SheetMode[] = [
    'gasto',
    'ingreso',
    ...(debitAccounts.length ? (['traspaso'] as SheetMode[]) : []), // necesita ≥2 cuentas de liquidez
    ...(accountsWithEnvelopes.length ? (['apartado'] as SheetMode[]) : []),
    ...(cards.length ? (['pago'] as SheetMode[]) : []),
    'real',
    ...(blockTargets.length ? (['bloqueo'] as SheetMode[]) : []),
  ]
  const isReal = mode === 'real'
  const isPago = mode === 'pago'
  const isTraspaso = mode === 'traspaso'
  const isApartado = mode === 'apartado'
  const isBloqueo = mode === 'bloqueo'
  const isGasto = mode === 'gasto'
  const isRecurring = movement?.source?.kind === 'recurrence'
  const hasOtherAccounts =
    debitAccounts.length > 0 || cards.length > 0 || voucherAccounts.length > 0

  // cuentas donde el gasto PUEDE haberse pagado (para el override "lo pagué con")
  const overrideOptions = useMemo(
    () => [
      ...(cashEligible ? [EFECTIVO_OPT] : []),
      ...(debitEligible ? debitAccounts : []),
      ...(creditEligible ? cards : []),
    ],
    [cashEligible, debitEligible, creditEligible, debitAccounts, cards],
  )

  const canSave = isBloqueo
    ? !!payCardId
    : amount !== '' &&
      !Number.isNaN(Number(amount)) &&
      (isReal || isPago || isTraspaso || isApartado || name.trim() !== '') &&
      (!isPago || !!payCardId) &&
      (!isTraspaso || (!!transferTo && transferTo !== transferFrom)) &&
      (!isApartado || !!envOf(envId))

  function changeMode(next: SheetMode) {
    setMode(next)
    if (next === 'real') setDate('')
    if (next === 'bloqueo' && !blockTargets.some((c) => c.id === payCardId)) {
      setPayCardId(blockTargets[0]?.id)
    }
    if (next === 'pago' && !cards.some((c) => c.id === payCardId)) {
      setPayCardId(cards[0]?.id)
    }
    if (next === 'traspaso' && (!transferTo || transferTo === transferFrom)) {
      setTransferTo(cashAccounts.find((a) => a.id !== transferFrom)?.id)
    }
    if (next === 'apartado' && !envOf(envId)) {
      const first = envelopes[0]
      setEnvAccount(first?.accountId ?? LIQUID)
      setEnvId(first?.id)
    }
  }

  function submit() {
    if (!canSave) return
    const wk = date && !isReal ? mondayOf(date) : week || undefined
    if (isBloqueo) {
      onSubmit({
        kind: 'delta',
        name: `${blockOn ? 'Apagar' : 'Prender'} ${nameOf(payCardId)}`,
        amount: 0,
        cardBlock: { cardId: payCardId as ID, blocked: blockOn },
        weekStart: wk,
        date: date || undefined,
      })
    } else if (isReal) {
      onSubmit({
        kind: 'anchor',
        name: name.trim() || nameOf(account),
        amount: toCents(Math.abs(Number(amount))),
        accountId: account,
        weekStart: week || undefined,
      })
    } else if (isApartado) {
      const env = envOf(envId)!
      onSubmit({
        kind: 'delta',
        name: name.trim() || (envDir === 'in' ? `Apartar ${env.name}` : `Sacar de ${env.name}`),
        amount: toCents(Math.abs(Number(amount))),
        transfer:
          envDir === 'in'
            ? { fromId: env.accountId, toId: env.id }
            : { fromId: env.id, toId: env.accountId },
        weekStart: wk,
        date: date || undefined,
        recurrence: movement ? undefined : recurrenceFromPreset(repeat, date || week),
      })
    } else if (isTraspaso) {
      onSubmit({
        kind: 'delta',
        name: name.trim() || `${nameOf(transferFrom)} → ${nameOf(transferTo)}`,
        amount: toCents(Math.abs(Number(amount))),
        transfer: { fromId: transferFrom, toId: transferTo as ID },
        weekStart: wk,
        date: date || undefined,
        recurrence: movement ? undefined : recurrenceFromPreset(repeat, date || week),
      })
    } else if (isPago) {
      onSubmit({
        kind: 'delta',
        name: name.trim() || `Pago ${nameOf(payCardId)}`,
        amount: -toCents(Math.abs(Number(amount))),
        payCardId,
        paidWith: paidWith && paidWith !== LIQUID ? paidWith : undefined,
        weekStart: wk,
        date: date || undefined,
      })
    } else if (isGasto) {
      const cents = toCents(Math.abs(Number(amount)))
      // los vales y los apartados SIEMPRE son override válido: es la única forma de pagar con ellos
      const validOverride =
        paidWith &&
        (overrideOptions.some((o) => o.id === paidWith) ||
          voucherAccounts.some((v) => v.id === paidWith) ||
          !!envOf(paidWith))
      onSubmit({
        kind: 'delta',
        name: name.trim(),
        amount: -cents,
        weekStart: wk,
        date: date || undefined,
        categoryId,
        cashEligible,
        debitEligible,
        creditEligible,
        paidWith: validOverride ? paidWith : undefined,
        recurrence: movement ? undefined : recurrenceFromPreset(repeat, date || week),
      })
    } else {
      // ingreso
      const cents = toCents(Math.abs(Number(amount)))
      onSubmit({
        kind: 'delta',
        name: name.trim(),
        amount: cents,
        weekStart: wk,
        date: date || undefined,
        categoryId,
        paidWith: paidWith && paidWith !== LIQUID ? paidWith : undefined,
        recurrence: movement ? undefined : recurrenceFromPreset(repeat, date || week),
      })
    }
    onOpenChange(false)
  }

  const amountLabel = isReal
    ? isCreditAccount(account)
      ? `Deuda real de ${nameOf(account)}`
      : `Saldo real de ${nameOf(account)}`
    : isPago
      ? 'Cuánto abonas'
      : 'Monto'

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] max-w-md flex-col rounded-t-[22px] border-2 border-line bg-surface outline-none">
          <div className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-fg/15" />

          {/* acciones SIEMPRE accesibles arriba (aunque salga el teclado) */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b-2 border-line/10 px-4 py-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-1 text-sm font-semibold text-muted"
            >
              Cancelar
            </button>
            <Drawer.Title className="font-display text-base font-bold">
              {movement ? 'Editar' : 'Nuevo'}
            </Drawer.Title>
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className="rounded-chunky border-2 border-ink bg-accent px-3.5 py-1.5 text-sm font-bold text-ink shadow-hard-sm transition-transform active:translate-y-0.5 disabled:opacity-40 disabled:shadow-none"
            >
              {movement ? 'Guardar' : 'Agregar'}
            </button>
          </div>
          <Drawer.Description className="sr-only">Formulario de movimiento</Drawer.Description>

          <div className="flex-1 space-y-3.5 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
            {isRecurring && (
              <div className="flex items-center gap-2 rounded-chunky border-2 border-line bg-fg/5 px-3 py-2 text-sm font-semibold">
                <Repeat size={15} /> Parte de una serie recurrente
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {modes.map((mo) => (
                <button
                  key={mo}
                  onClick={() => changeMode(mo)}
                  className={cn(
                    'rounded-chunky border-2 border-line py-2 text-sm font-bold transition-transform active:translate-y-0.5',
                    mode === mo ? ACTIVE_CLS[mo] + ' shadow-hard-sm' : 'bg-surface text-fg',
                  )}
                >
                  {LABELS[mo]}
                </button>
              ))}
            </div>

            {isBloqueo ? (
              <>
                <Chips
                  label="¿Qué cuenta apagas/prendes?"
                  options={blockTargets}
                  value={payCardId}
                  onChange={setPayCardId}
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBlockOn(true)}
                    className={cn(
                      'rounded-chunky border-2 border-line py-2 text-sm font-bold active:translate-y-0.5',
                      blockOn ? 'bg-ink text-paper shadow-hard-sm' : 'bg-surface',
                    )}
                  >
                    🔒 Apagar
                  </button>
                  <button
                    onClick={() => setBlockOn(false)}
                    className={cn(
                      'rounded-chunky border-2 border-line py-2 text-sm font-bold active:translate-y-0.5',
                      !blockOn ? 'bg-pos text-white shadow-hard-sm' : 'bg-surface',
                    )}
                  >
                    🔓 Prender
                  </button>
                </div>
                <p className="px-1 text-xs text-muted">
                  {blockOn
                    ? 'A partir de esta semana no saldrá dinero de esta cuenta (una tarjeta de crédito sí podrás pagarla).'
                    : 'A partir de esta semana la cuenta vuelve a poder usarse.'}
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
                      isReal
                        ? nameOf(account)
                        : isPago
                          ? `Pago ${nameOf(payCardId)}`
                          : isTraspaso
                            ? `${nameOf(transferFrom)} → ${nameOf(transferTo)}`
                            : isApartado
                              ? envDir === 'in'
                                ? `Apartar ${envOf(envId)?.name ?? ''}`
                                : `Sacar de ${envOf(envId)?.name ?? ''}`
                              : 'Gasolina, Don René…'
                    }
                    className="w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
                  />
                </Field>

                <Field label={amountLabel}>
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
                    options={allAccounts}
                    value={account}
                    onChange={setAccount}
                  />
                )}
                {isTraspaso && (
                  <>
                    <Chips
                      label="¿De qué cuenta sale?"
                      options={cashAccounts}
                      value={transferFrom}
                      onChange={(id) => {
                        setTransferFrom(id)
                        if (transferTo === id)
                          setTransferTo(cashAccounts.find((a) => a.id !== id)?.id)
                      }}
                    />
                    <Chips
                      label="¿A qué cuenta entra?"
                      options={cashAccounts.filter((a) => a.id !== transferFrom)}
                      value={transferTo}
                      onChange={setTransferTo}
                    />
                    <p className="px-1 text-xs text-muted">
                      Solo mueve dinero entre tus cuentas de liquidez: tu saldo líquido total no cambia.
                    </p>
                  </>
                )}
                {isApartado && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setEnvDir('in')}
                        className={cn(
                          'rounded-chunky border-2 border-line py-2 text-sm font-bold active:translate-y-0.5',
                          envDir === 'in' ? 'bg-[#9b51e0] text-white shadow-hard-sm' : 'bg-surface',
                        )}
                      >
                        Apartar
                      </button>
                      <button
                        onClick={() => setEnvDir('out')}
                        className={cn(
                          'rounded-chunky border-2 border-line py-2 text-sm font-bold active:translate-y-0.5',
                          envDir === 'out' ? 'bg-ink text-paper shadow-hard-sm' : 'bg-surface',
                        )}
                      >
                        Sacar del apartado
                      </button>
                    </div>
                    {accountsWithEnvelopes.length > 1 && (
                      <Chips
                        label="¿En qué cuenta?"
                        options={accountsWithEnvelopes}
                        value={envAccount}
                        onChange={(id) => {
                          setEnvAccount(id)
                          setEnvId(envelopesFor(id)[0]?.id)
                        }}
                      />
                    )}
                    <Chips
                      label="¿Qué apartado?"
                      options={envelopesFor(envAccount)}
                      value={envId}
                      onChange={setEnvId}
                    />
                    <p className="px-1 text-xs text-muted">
                      {envDir === 'in'
                        ? `El dinero se queda en ${nameOf(envAccount)}, pero deja de estar libre: los gastos automáticos no lo tocan.`
                        : `El dinero vuelve a estar libre en ${nameOf(envAccount)}.`}
                    </p>
                  </>
                )}
                {isPago && (
                  <>
                    <Chips
                      label="¿Qué tarjeta pagas?"
                      options={cards}
                      value={payCardId}
                      onChange={setPayCardId}
                    />
                    {(debitAccounts.length > 0 || envelopes.length > 0) && (
                      <Chips
                        label="¿De qué cuenta sale el pago?"
                        options={cashAccounts}
                        value={acctOfSel(paidWith) ?? LIQUID}
                        onChange={setPaidWith}
                      />
                    )}
                    <EnvelopePick
                      accountId={acctOfSel(paidWith) ?? LIQUID}
                      envelopes={envelopes}
                      value={paidWith}
                      onChange={setPaidWith}
                    />
                  </>
                )}
                {mode === 'ingreso' && (incomeTargets.length > 1 || envelopes.length > 0) && (
                  <>
                    <Chips
                      label="¿A qué cuenta entró?"
                      options={incomeTargets}
                      value={acctOfSel(paidWith) ?? LIQUID}
                      onChange={setPaidWith}
                    />
                    <EnvelopePick
                      accountId={acctOfSel(paidWith) ?? LIQUID}
                      envelopes={envelopes}
                      value={paidWith}
                      onChange={setPaidWith}
                    />
                  </>
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

                {isGasto && (hasOtherAccounts || envelopes.length > 0) && (
                  <div className="space-y-2 rounded-chunky border-2 border-line bg-fg/5 p-2.5">
                    {(debitAccounts.length > 0 || cards.length > 0) && (
                      <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        ¿Con qué se puede pagar?
                      </span>
                    )}
                    {(debitAccounts.length > 0 || cards.length > 0) && (
                      <Toggle
                        label="Efectivo"
                        on={cashEligible}
                        onToggle={() => setCashEligible((v) => !v)}
                      />
                    )}
                    {debitAccounts.length > 0 && (
                      <Toggle
                        label="Tarjeta de débito"
                        on={debitEligible}
                        onToggle={() => setDebitEligible((v) => !v)}
                      />
                    )}
                    {cards.length > 0 && (
                      <Toggle
                        label="Tarjeta de crédito"
                        on={creditEligible}
                        onToggle={() => setCreditEligible((v) => !v)}
                      />
                    )}
                    {(overrideOptions.length > 1 ||
                      voucherAccounts.length > 0 ||
                      envelopes.length > 0) && (
                      <div className="pt-1">
                        <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Lo pagué con (opcional)
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <button
                            onClick={() => setPaidWith(undefined)}
                            className={cn(
                              'rounded-full border-2 border-line px-3 py-1 text-sm font-semibold',
                              !paidWith ? 'bg-ink text-paper' : 'bg-surface',
                            )}
                          >
                            Auto
                          </button>
                          {overrideOptions.map((o) => (
                            <button
                              key={o.id}
                              onClick={() => setPaidWith(o.id)}
                              className={cn(
                                'flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1 text-sm font-semibold',
                                acctOfSel(paidWith) === o.id ? 'bg-ink text-paper' : 'bg-surface',
                              )}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ background: o.color }}
                              />
                              {o.name}
                            </button>
                          ))}
                          {voucherAccounts.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => setPaidWith(v.id)}
                              title="Vales: solo si lo eliges aquí"
                              className={cn(
                                'flex items-center gap-1.5 rounded-full border-2 border-dashed border-line px-3 py-1 text-sm font-semibold',
                                paidWith === v.id ? 'bg-ink text-paper' : 'bg-surface',
                              )}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ background: v.color }}
                              />
                              {v.name}
                              <span className="text-[10px] uppercase opacity-60">vales</span>
                            </button>
                          ))}
                        </div>
                        {paidWith && !envOf(paidWith)?.id && (
                          <div className="mt-2">
                            <EnvelopePick
                              accountId={paidWith}
                              envelopes={envelopes}
                              value={paidWith}
                              onChange={setPaidWith}
                            />
                          </div>
                        )}
                        {paidWith && envOf(paidWith) && (
                          <div className="mt-2">
                            <EnvelopePick
                              accountId={envOf(paidWith)!.accountId}
                              envelopes={envelopes}
                              value={paidWith}
                              onChange={setPaidWith}
                            />
                          </div>
                        )}
                        {voucherAccounts.length > 0 && (
                          <p className="mt-1.5 px-1 text-[11px] text-muted">
                            Los vales nunca se usan en automático: solo si los eliges aquí.
                          </p>
                        )}
                        {envelopes.length > 0 && (
                          <p className="mt-1.5 px-1 text-[11px] text-muted">
                            Lo apartado tampoco: en automático solo se usa el dinero libre de cada cuenta.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(mode === 'gasto' || mode === 'ingreso') && categories.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCategoryId(categoryId === c.id ? undefined : c.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1 text-sm font-semibold',
                          categoryId === c.id ? 'bg-ink text-paper' : 'bg-surface',
                        )}
                      >
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}

                {!movement &&
                  (mode === 'gasto' ||
                    mode === 'ingreso' ||
                    mode === 'traspaso' ||
                    mode === 'apartado') && (
                  <Field label="Repetir">
                    <select
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value as RecurrencePreset)}
                      className="w-full bg-transparent text-base outline-none"
                    >
                      {(Object.keys(PRESET_LABELS) as RecurrencePreset[]).map((p) => (
                        <option key={p} value={p}>
                          {PRESET_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </>
            )}

            {movement &&
              onDelete &&
              (deleteMode ? (
                <div className="space-y-2 border-t-2 border-line/15 pt-3">
                  <p className="px-1 text-sm font-semibold">¿Qué quieres borrar de la serie?</p>
                  <button
                    onClick={() => {
                      onDelete(movement.id)
                      onOpenChange(false)
                    }}
                    className="w-full rounded-chunky border-2 border-line bg-surface py-3 text-sm font-bold text-neg active:translate-y-0.5"
                  >
                    Solo este registro
                  </button>
                  <button
                    onClick={() => {
                      onDeleteFollowing?.(movement)
                      onOpenChange(false)
                    }}
                    className="w-full rounded-chunky border-2 border-ink bg-neg py-3 text-sm font-bold text-white shadow-hard-sm active:translate-y-0.5"
                  >
                    Este y todos los siguientes
                  </button>
                  <button
                    onClick={() => setDeleteMode(false)}
                    className="w-full py-2 text-sm font-semibold text-muted"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (isRecurring) setDeleteMode(true)
                    else {
                      onDelete(movement.id)
                      onOpenChange(false)
                    }
                  }}
                  className="flex w-full items-center justify-center gap-2 border-t-2 border-line/15 pt-3 text-sm font-bold text-neg"
                >
                  <Trash2 size={16} /> Borrar movimiento
                </button>
              ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

function Toggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-chunky border-2 border-line bg-surface px-3 py-2 text-left"
    >
      <span className="text-sm font-semibold">{label}</span>
      <span
        className={cn(
          'flex h-6 w-11 items-center rounded-full border-2 border-ink p-0.5 transition-colors',
          on ? 'bg-accent' : 'bg-surface',
        )}
      >
        <span
          className={cn('h-4 w-4 rounded-full bg-ink transition-transform', on && 'translate-x-5')}
        />
      </span>
    </button>
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
                  'flex flex-col items-center rounded-lg border-2 border-line py-1 transition-transform active:translate-y-0.5',
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

/**
 * Fila "¿De qué apartado?" para una cuenta de liquidez. `value` es la selección actual
 * (id de la cuenta = sin apartado, o id de un apartado). No se muestra si la cuenta no tiene apartados.
 */
function EnvelopePick({
  accountId,
  envelopes,
  value,
  onChange,
}: {
  accountId: ID
  envelopes: Envelope[]
  value?: ID
  onChange: (id: ID) => void
}) {
  const list = envelopes.filter((e) => e.accountId === accountId)
  if (!list.length) return null
  const noneActive = !list.some((e) => e.id === value)
  return (
    <div>
      <span className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        ¿De qué apartado?
      </span>
      <div className="mt-1 flex flex-wrap gap-2">
        <button
          onClick={() => onChange(accountId)}
          className={cn(
            'rounded-full border-2 border-line px-3 py-1 text-sm font-semibold',
            noneActive ? 'bg-ink text-paper' : 'bg-surface',
          )}
        >
          Dinero libre
        </button>
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => onChange(e.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border-2 border-dotted border-line px-3 py-1 text-sm font-semibold',
              value === e.id ? 'bg-ink text-paper' : 'bg-surface',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: e.color }} />
            {e.name}
          </button>
        ))}
      </div>
    </div>
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
              'flex items-center gap-1.5 rounded-full border-2 border-line px-3 py-1 text-sm font-semibold',
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
    <label className="block rounded-chunky border-2 border-line bg-surface px-3 py-2 focus-within:shadow-hard-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
