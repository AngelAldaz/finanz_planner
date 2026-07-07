// Suscripción a Web Push (cliente). La notificación real la envía la Edge Function `notify`.
import { supabase } from './client'

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY
/** La feature de notificaciones está disponible solo si pegaste la llave pública VAPID. */
export const pushConfigured = Boolean(VAPID_PUBLIC)

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
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  if (supabase) await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
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
}
