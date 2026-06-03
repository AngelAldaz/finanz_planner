import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Drawer } from 'vaul'
import { Trash2 } from 'lucide-react'
import type { Category, Cents, ID, ISODate, Movement, MovementKind } from '../../domain/types'
import { addDays, mondayOf, parseISO, weekRangeLabel } from '../../domain/dates'
import { fromCents, toCents } from '../../domain/money'
import { cn } from '../../lib/cn'

export type SheetMode = 'gasto' | 'ingreso' | 'real'

export interface MovementSubmit {
  kind: MovementKind
  name: string
  amount: Cents
  weekStart?: ISODate
  date?: ISODate
  categoryId?: ID
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  movement?: Movement | null
  defaultWeek?: ISODate
  defaultMode?: SheetMode
  weeks: ISODate[]
  categories: Category[]
  onSubmit: (data: MovementSubmit) => void
  onDelete?: (id: ID) => void
}

const DOW = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do']

function modeOf(m: Movement | null | undefined): SheetMode {
  if (!m) return 'gasto'
  if (m.kind === 'anchor') return 'real'
  return m.amount >= 0 ? 'ingreso' : 'gasto'
}

const MODES: { id: SheetMode; label: string; active: string }[] = [
  { id: 'gasto', label: 'Gasto', active: 'bg-neg text-white' },
  { id: 'ingreso', label: 'Ingreso', active: 'bg-pos text-white' },
  { id: 'real', label: 'Saldo real', active: 'bg-accent text-ink' },
]

export function MovementSheet({
  open,
  onOpenChange,
  movement,
  defaultWeek,
  defaultMode,
  weeks,
  categories,
  onSubmit,
  onDelete,
}: Props) {
  const [mode, setMode] = useState<SheetMode>('gasto')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [week, setWeek] = useState<ISODate>('')
  const [date, setDate] = useState<string>('')
  const [categoryId, setCategoryId] = useState<ID | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    const m = movement ?? null
    setMode(defaultMode ?? modeOf(m))
    setName(m?.name ?? '')
    setAmount(m ? String(Math.abs(fromCents(m.amount))) : '')
    setWeek(m?.weekStart ?? (m?.date ? mondayOf(m.date) : (defaultWeek ?? weeks[0] ?? '')))
    setDate(m?.date ?? '')
    setCategoryId(m?.categoryId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const weekDays = useMemo(
    () => (week ? Array.from({ length: 7 }, (_, i) => addDays(week, i)) : []),
    [week],
  )

  const isReal = mode === 'real'
  const canSave =
    amount !== '' && !Number.isNaN(Number(amount)) && (isReal || name.trim() !== '')

  function changeMode(next: SheetMode) {
    setMode(next)
    if (next === 'real') setDate('') // el saldo real se fija al inicio de la semana
  }

  function submit() {
    if (!canSave) return
    const cents = toCents(Math.abs(Number(amount)))
    onSubmit({
      kind: isReal ? 'anchor' : 'delta',
      name: isReal ? name.trim() || 'Saldo real' : name.trim(),
      amount: mode === 'gasto' ? -cents : cents,
      weekStart: isReal ? week || undefined : date ? mondayOf(date) : week || undefined,
      date: isReal ? undefined : date || undefined,
      categoryId: isReal ? undefined : categoryId,
    })
    onOpenChange(false)
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col rounded-t-[22px] border-2 border-ink bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-ink/20" />
          <div className="space-y-3.5 p-5">
            <Drawer.Title className="font-display text-xl font-bold">
              {movement ? 'Editar movimiento' : 'Nuevo movimiento'}
            </Drawer.Title>
            <Drawer.Description className="sr-only">Formulario de movimiento</Drawer.Description>

            <div className="grid grid-cols-3 gap-2">
              {MODES.map((mo) => (
                <button
                  key={mo.id}
                  onClick={() => changeMode(mo.id)}
                  className={cn(
                    'rounded-chunky border-2 border-ink py-2 text-sm font-bold transition-transform active:translate-y-0.5',
                    mode === mo.id ? mo.active + ' shadow-hard-sm' : 'bg-surface text-ink',
                  )}
                >
                  {mo.label}
                </button>
              ))}
            </div>

            <Field label="Concepto">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isReal ? 'Saldo real' : 'Gasolina, Don René…'}
                autoFocus={!movement}
                className="w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
              />
            </Field>

            <Field label={isReal ? 'Saldo real en tu cuenta' : 'Monto'}>
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

            <Field label="Semana">
              <select
                value={week}
                onChange={(e) => {
                  setWeek(e.target.value)
                  setDate('') // el día elegido pertenecía a la semana anterior
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

            {isReal ? (
              <p className="px-1 text-xs text-muted">
                El saldo real se fija al inicio de la semana seleccionada.
              </p>
            ) : (
              <div>
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  Día (opcional)
                </span>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {weekDays.map((d, i) => {
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
                        <span className="font-mono text-sm tnum">{parseISO(d).d}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {!isReal && categories.length > 0 && (
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-chunky border-2 border-ink bg-surface px-3 py-2 focus-within:shadow-hard-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
