import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { Trash2 } from 'lucide-react'
import type { CreditCard, ID } from '../../domain/types'
import { fromCents, toCents } from '../../domain/money'
import { cn } from '../../lib/cn'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  card?: CreditCard | null
  onSave: (data: { id?: ID; name: string; limit: number; blocked: boolean }) => void
  onDelete?: (id: ID) => void
}

export function CardSheet({ open, onOpenChange, card, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(card?.name ?? '')
    setLimit(card ? String(fromCents(card.limit)) : '')
    setBlocked(card?.blocked ?? false)
  }, [open, card])

  const canSave = name.trim() !== '' && limit !== '' && !Number.isNaN(Number(limit))

  function save() {
    if (!canSave) return
    onSave({ id: card?.id, name: name.trim(), limit: toCents(Number(limit)), blocked })
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
              {card ? 'Editar tarjeta' : 'Nueva tarjeta de crédito'}
            </Drawer.Title>
            <Drawer.Description className="sr-only">Datos de la tarjeta</Drawer.Description>

            <label className="block rounded-chunky border-2 border-ink bg-surface px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="BBVA, Nu, Amex…"
                autoFocus={!card}
                className="mt-0.5 w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
              />
            </label>

            <label className="block rounded-chunky border-2 border-ink bg-surface px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                Límite de crédito
              </span>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="font-mono text-lg text-muted">$</span>
                <input
                  value={limit}
                  onChange={(e) => setLimit(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="50000"
                  className="tnum w-full bg-transparent font-mono text-lg outline-none placeholder:text-muted/60"
                />
              </div>
            </label>

            <button
              onClick={() => setBlocked((v) => !v)}
              className="flex w-full items-center justify-between rounded-chunky border-2 border-ink bg-surface px-3 py-2.5 text-left"
            >
              <span className="pr-3">
                <span className="block text-sm font-semibold">Bloquear tarjeta</span>
                <span className="block text-xs text-muted">
                  No saldrá dinero de ella para gastos; sí podrás pagarla.
                </span>
              </span>
              <span
                className={cn(
                  'flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-ink p-0.5 transition-colors',
                  blocked ? 'bg-neg' : 'bg-surface',
                )}
              >
                <span
                  className={cn(
                    'h-4 w-4 rounded-full bg-ink transition-transform',
                    blocked && 'translate-x-5',
                  )}
                />
              </span>
            </button>

            <div className="flex gap-2 pt-1">
              {card && onDelete && (
                <button
                  onClick={() => {
                    onDelete(card.id)
                    onOpenChange(false)
                  }}
                  aria-label="Eliminar tarjeta"
                  className="flex items-center justify-center rounded-chunky border-2 border-ink bg-surface px-4 py-3 text-neg active:translate-y-0.5"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={save}
                disabled={!canSave}
                className="flex-1 rounded-chunky border-2 border-ink bg-accent py-3 text-base font-bold text-ink shadow-hard transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm disabled:opacity-40"
              >
                {card ? 'Guardar' : 'Agregar tarjeta'}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
