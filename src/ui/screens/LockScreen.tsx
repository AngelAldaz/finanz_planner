import { useState } from 'react'
import { verifyPin } from '../../lib/pin'
import { cn } from '../../lib/cn'

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  async function submit() {
    if (await verifyPin(pin)) onUnlock()
    else {
      setError(true)
      setPin('')
    }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-canvas p-6">
      <div className="w-full max-w-xs space-y-4 text-center">
        <h1 className="font-display text-4xl font-bold tracking-tight">finanz.</h1>
        <p className="text-sm text-muted">Ingresa tu PIN para desbloquear</p>
        <input
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/[^0-9]/g, ''))
            setError(false)
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          inputMode="numeric"
          type="password"
          autoFocus
          maxLength={12}
          className={cn(
            'w-full rounded-chunky border-2 border-line bg-surface py-4 text-center font-mono text-2xl tracking-[0.4em] outline-none',
            error && 'border-neg',
          )}
        />
        {error && <p className="text-sm font-semibold text-neg">PIN incorrecto</p>}
        <button
          onClick={submit}
          className="w-full rounded-chunky border-2 border-line bg-accent py-3 text-base font-bold text-ink shadow-hard transition-transform active:translate-y-0.5"
        >
          Desbloquear
        </button>
      </div>
    </div>
  )
}
