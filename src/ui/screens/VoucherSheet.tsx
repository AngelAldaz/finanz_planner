import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import { Trash2 } from 'lucide-react'
import type { ID, VoucherAccount } from '../../domain/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  account?: VoucherAccount | null
  onSave: (data: { id?: ID; name: string }) => void
  onDelete?: (id: ID) => void
}

/** Alta/edición de una tarjeta de vales (despensa, restaurante, gasolina…). */
export function VoucherSheet({ open, onOpenChange, account, onSave, onDelete }: Props) {
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName(account?.name ?? '')
  }, [open, account])

  const canSave = name.trim() !== ''

  function save() {
    if (!canSave) return
    onSave({ id: account?.id, name: name.trim() })
    onOpenChange(false)
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md flex-col rounded-t-[22px] border-2 border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] outline-none">
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-ink/20" />
          <div className="space-y-3.5 p-5">
            <Drawer.Title className="font-display text-xl font-bold">
              {account ? 'Editar tarjeta de vales' : 'Nueva tarjeta de vales'}
            </Drawer.Title>
            <Drawer.Description className="sr-only">Datos de la tarjeta de vales</Drawer.Description>

            <label className="block rounded-chunky border-2 border-line bg-surface px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Nombre</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vales de despensa, Edenred, Sodexo…"
                className="mt-0.5 w-full bg-transparent text-lg outline-none placeholder:text-muted/60"
              />
            </label>

            <p className="px-1 text-xs text-muted">
              Los vales van <b>aparte</b> de tu líquido y <b>nunca</b> pagan nada solos. Un gasto sale de
              aquí solo si lo eliges en «Lo pagué con». Carga saldo con un ingreso «a esta cuenta» o
              fíjalo con «Saldo real».
            </p>

            <div className="flex gap-2 pt-1">
              {account && onDelete && (
                <button
                  onClick={() => {
                    onDelete(account.id)
                    onOpenChange(false)
                  }}
                  aria-label="Eliminar tarjeta de vales"
                  className="flex items-center justify-center rounded-chunky border-2 border-line bg-surface px-4 py-3 text-neg active:translate-y-0.5"
                >
                  <Trash2 size={18} />
                </button>
              )}
              <button
                onClick={save}
                disabled={!canSave}
                className="flex-1 rounded-chunky border-2 border-line bg-accent py-3 text-base font-bold text-ink shadow-hard transition-transform active:translate-x-0.5 active:translate-y-0.5 active:shadow-hard-sm disabled:opacity-40"
              >
                {account ? 'Guardar' : 'Agregar'}
              </button>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
