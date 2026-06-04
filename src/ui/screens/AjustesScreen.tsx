import { useState, type ReactNode } from 'react'
import { Cloud, Download, LogOut, RefreshCw, Upload } from 'lucide-react'
import { usePlanStore } from '../../state/planStore'
import { useUiStore } from '../../state/uiStore'
import { useCloudStore } from '../../state/cloudStore'
import { repository } from '../../data'
import { fromCents, toCents } from '../../domain/money'
import { hasPin, removePin, setPin } from '../../lib/pin'
import type { ThemePref } from '../../lib/theme'
import { cn } from '../../lib/cn'

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
]

export function AjustesScreen() {
  const plans = usePlanStore((s) => s.plans)
  const activePlanId = usePlanStore((s) => s.activePlanId)
  const plan = plans.find((p) => p.id === activePlanId)
  const setPlanName = usePlanStore((s) => s.setPlanName)
  const threshold = usePlanStore((s) => s.lowBalanceThreshold)
  const setThreshold = usePlanStore((s) => s.setLowBalanceThreshold)
  const init = usePlanStore((s) => s.init)
  const theme = useUiStore((s) => s.theme)
  const setTheme = useUiStore((s) => s.setTheme)

  const [thr, setThr] = useState('')
  const [pinSet, setPinSet] = useState(hasPin())
  const [editingPin, setEditingPin] = useState(false)
  const [newPin, setNewPin] = useState('')

  async function exportData() {
    const bundle = await repository.exportAll()
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'finanz-respaldo.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function importData(file: File) {
    await repository.importAll(JSON.parse(await file.text()))
    await init()
  }
  async function savePin() {
    if (newPin.length < 4) return
    await setPin(newPin)
    setPinSet(true)
    setEditingPin(false)
    setNewPin('')
  }

  return (
    <div className="space-y-5 pb-28">
      <CloudSection />

      <Card title="Apariencia">
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                'rounded-chunky border-2 border-line py-2 text-sm font-bold',
                theme === t.id ? 'bg-ink text-paper shadow-hard-sm' : 'bg-surface text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      {plan && (
        <Card title="Plan">
          <Field label="Nombre">
            <input
              defaultValue={plan.name}
              onBlur={(e) => e.target.value.trim() && setPlanName(e.target.value.trim())}
              className="w-full bg-transparent text-base outline-none"
            />
          </Field>
          <p className="px-1 text-xs text-muted">
            Tu plan es continuo: agregas semana tras semana, sin un fin fijo.
          </p>
        </Card>
      )}

      <Card title="Alerta de saldo bajo">
        <Field label="Avísame si bajo de">
          <div className="flex items-center gap-1">
            <span className="font-mono text-muted">$</span>
            <input
              value={thr}
              onChange={(e) => setThr(e.target.value.replace(/[^0-9.]/g, ''))}
              onBlur={() => thr !== '' && setThreshold(toCents(Number(thr)))}
              inputMode="decimal"
              placeholder={String(fromCents(threshold))}
              className="tnum w-full bg-transparent font-mono text-base outline-none"
            />
          </div>
        </Field>
      </Card>

      <Card title="Bloqueo con PIN">
        {editingPin ? (
          <div className="space-y-2">
            <Field label="Nuevo PIN (4+ dígitos)">
              <input
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                type="password"
                maxLength={12}
                autoFocus
                className="tnum w-full bg-transparent font-mono text-lg tracking-widest outline-none"
              />
            </Field>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditingPin(false)
                  setNewPin('')
                }}
                className="flex-1 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={savePin}
                disabled={newPin.length < 4}
                className="flex-1 rounded-chunky border-2 border-line bg-accent py-2.5 text-sm font-bold text-ink shadow-hard-sm disabled:opacity-40"
              >
                Guardar PIN
              </button>
            </div>
          </div>
        ) : pinSet ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              La app pedirá tu PIN al abrirse. (Privacidad, no cifrado.)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingPin(true)}
                className="flex-1 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold"
              >
                Cambiar PIN
              </button>
              <button
                onClick={() => {
                  removePin()
                  setPinSet(false)
                }}
                className="flex-1 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold text-neg"
              >
                Quitar PIN
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditingPin(true)}
            className="w-full rounded-chunky border-2 border-line bg-accent py-2.5 text-sm font-bold text-ink shadow-hard-sm"
          >
            Activar PIN
          </button>
        )}
      </Card>

      <Card title="Respaldo (JSON)">
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="flex flex-1 items-center justify-center gap-2 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold active:translate-y-0.5"
          >
            <Download size={16} /> Exportar
          </button>
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold active:translate-y-0.5">
            <Upload size={16} /> Importar
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])}
            />
          </label>
        </div>
        <p className="mt-2 px-1 text-xs text-muted">Importar reemplaza todos tus datos locales.</p>
      </Card>

      <p className="px-1 text-center text-xs text-muted">finanz · tus datos viven solo en este dispositivo</p>
    </div>
  )
}

function CloudSection() {
  const configured = useCloudStore((s) => s.configured)
  const email = useCloudStore((s) => s.email)
  const status = useCloudStore((s) => s.status)
  const error = useCloudStore((s) => s.error)
  const signIn = useCloudStore((s) => s.signIn)
  const signUp = useCloudStore((s) => s.signUp)
  const signOut = useCloudStore((s) => s.signOut)
  const syncNow = useCloudStore((s) => s.syncNow)
  const [mail, setMail] = useState('')
  const [pwd, setPwd] = useState('')

  if (!configured) {
    return (
      <Card title="Nube (respaldo y sync)">
        <p className="text-sm text-muted">
          Hoy tus datos viven solo en este dispositivo. Para respaldarlos y sincronizarlos entre tu
          iPhone y tu compu, activa Supabase: crea un proyecto gratis, corre el SQL y pega tus 2
          llaves en <span className="font-mono">.env</span> (ver <span className="font-semibold">SUPABASE.md</span>).
        </p>
      </Card>
    )
  }

  if (!email) {
    return (
      <Card title="Cuenta y nube">
        <Field label="Correo">
          <input
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            type="email"
            autoComplete="email"
            className="w-full bg-transparent text-base outline-none"
          />
        </Field>
        <Field label="Contraseña">
          <input
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            type="password"
            autoComplete="current-password"
            className="w-full bg-transparent text-base outline-none"
          />
        </Field>
        {error && <p className="px-1 text-sm font-semibold text-neg">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => void signUp(mail, pwd)}
            disabled={status === 'syncing'}
            className="flex-1 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold disabled:opacity-50"
          >
            Crear cuenta
          </button>
          <button
            onClick={() => void signIn(mail, pwd)}
            disabled={status === 'syncing'}
            className="flex-1 rounded-chunky border-2 border-line bg-accent py-2.5 text-sm font-bold text-ink shadow-hard-sm disabled:opacity-50"
          >
            Entrar
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card title="Cuenta y nube">
      <div className="flex items-center gap-2 text-sm">
        <Cloud size={16} className="text-pos" />
        <span className="min-w-0 flex-1 truncate font-semibold">{email}</span>
        <span className="text-xs text-muted">
          {status === 'syncing' ? 'Sincronizando…' : status === 'error' ? 'Error' : 'Sincronizado ✓'}
        </span>
      </div>
      {error && <p className="px-1 text-sm font-semibold text-neg">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void syncNow()}
          disabled={status === 'syncing'}
          className="flex flex-1 items-center justify-center gap-2 rounded-chunky border-2 border-line bg-surface py-2.5 text-sm font-bold disabled:opacity-50"
        >
          <RefreshCw size={15} /> Sincronizar
        </button>
        <button
          onClick={() => void signOut()}
          aria-label="Cerrar sesión"
          className="flex items-center justify-center rounded-chunky border-2 border-line bg-surface px-4 py-2.5 text-sm font-bold text-neg"
        >
          <LogOut size={15} />
        </button>
      </div>
    </Card>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-chunky border-2 border-line bg-surface p-4 shadow-hard">
      <h2 className="font-display text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block rounded-chunky border-2 border-line bg-canvas px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  )
}
