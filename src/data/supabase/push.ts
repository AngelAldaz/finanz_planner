// Suscripción a Web Push (cliente). La notificación real la envía la Edge Function `notify`.
import { supabase } from './client'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
/** La feature de notificaciones está disponible solo si pegaste la llave pública VAPID. */
export const pushConfigured = Boolean(VAPID_PUBLIC)

// Memoria local de la intención del usuario: iOS puede matar la suscripción en silencio
// (meses sin abrir, reinstalar, limpieza). Con esto la app la repara sola al abrir.
const LS_WANTED = 'finanz.push.wanted'
const LS_HOUR = 'finanz.push.hour'
const LS_ENDPOINT = 'finanz.push.endpoint'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* modo privado / sin storage: la renovación simplemente no aplica */
  }
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** En iOS el push SOLO funciona si la app está instalada en la pantalla de inicio. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function currentPushStatus(): Promise<'on' | 'off'> {
  if (!pushSupported()) return 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Estado actual + la hora de aviso GUARDADA (para que la UI muestre el valor real). */
export async function currentPush(): Promise<{ status: 'on' | 'off'; hour: number }> {
  if (!pushSupported()) return { status: 'off', hour: 9 }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { status: 'off', hour: 9 }
  let hour = 9
  if (supabase) {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('notify_hour')
      .eq('endpoint', sub.endpoint)
      .maybeSingle()
    if (data?.notify_hour != null) hour = Number(data.notify_hour)
  }
  return { status: 'on', hour }
}

/** Pide permiso, se suscribe y guarda la suscripción en Supabase. Debe llamarse desde un gesto. */
export async function enablePush(notifyHour: number): Promise<void> {
  if (!supabase) throw new Error('Nube no configurada')
  if (!VAPID_PUBLIC) throw new Error('Falta la llave VAPID pública')
  if (!pushSupported()) throw new Error('Este navegador no soporta notificaciones push')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No diste permiso de notificaciones')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
    })
  }

  const { data: userRes } = await supabase.auth.getUser()
  const uid = userRes.user?.id
  if (!uid) throw new Error('Inicia sesión en la nube primero')

  await saveSubscription(uid, sub, notifyHour)
  lsSet(LS_WANTED, '1')
  lsSet(LS_HOUR, String(notifyHour))
}

/** Sube (o refresca) la suscripción a Supabase; si el endpoint cambió, borra el anterior. */
async function saveSubscription(uid: string, sub: PushSubscription, notifyHour: number) {
  if (!supabase) return
  const json = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: uid,
      endpoint: json.endpoint,
      subscription: json,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      notify_hour: notifyHour,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  const prev = lsGet(LS_ENDPOINT)
  if (prev && prev !== json.endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', prev)
  }
  lsSet(LS_ENDPOINT, json.endpoint ?? null)
}

let refreshed = false
/**
 * Renueva la suscripción push al abrir la app (con sesión). Silenciosa: nunca pide permiso.
 * - Si hay suscripción, la vuelve a subir (endpoint vigente + fecha de hoy).
 * - Si iOS la perdió pero el permiso sigue concedido y el usuario la había activado, se
 *   vuelve a suscribir sola.
 * - Si el permiso ya no está, no hace nada: Ajustes mostrará "desactivadas".
 */
export async function refreshPush(): Promise<void> {
  if (refreshed || !supabase || !VAPID_PUBLIC || !pushSupported()) return
  try {
    const { data: userRes } = await supabase.auth.getUser()
    const uid = userRes.user?.id
    if (!uid) return // sin sesión aún: se intentará cuando inicie
    refreshed = true
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    const wanted = lsGet(LS_WANTED) === '1'
    if (!sub) {
      if (!wanted || Notification.permission !== 'granted') return
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      })
    }
    let hour = Number(lsGet(LS_HOUR))
    if (!Number.isFinite(hour)) {
      // navegador sin hora guardada (suscripción previa a esta versión): respeta la de la nube
      const { data } = await supabase
        .from('push_subscriptions')
        .select('notify_hour')
        .eq('endpoint', sub.endpoint)
        .maybeSingle()
      hour = data?.notify_hour != null ? Number(data.notify_hour) : 9
      lsSet(LS_HOUR, String(hour))
    }
    await saveSubscription(uid, sub, hour)
  } catch (e) {
    console.warn('push refresh:', (e as Error).message)
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  lsSet(LS_WANTED, null)
  lsSet(LS_ENDPOINT, null)
}

export async function updateNotifyHour(notifyHour: number): Promise<void> {
  if (!supabase || !pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await supabase
    .from('push_subscriptions')
    .update({ notify_hour: notifyHour })
    .eq('endpoint', sub.endpoint)
  lsSet(LS_HOUR, String(notifyHour))
}
