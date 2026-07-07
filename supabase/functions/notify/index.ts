// Edge Function (Deno): envía notificaciones push de gastos "hoy" y "mañana".
// La invoca un cron cada hora; para cada suscripción decide si es SU hora local de aviso.
// Secrets necesarios (supabase secrets set ...): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:...), CRON_SECRET.  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los
// inyecta Supabase automáticamente.
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notificaciones@finanz.app'
const CRON_SECRET = Deno.env.get('CRON_SECRET')

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

/** Fecha (YYYY-MM-DD) y hora (0-23) locales en una timezone. */
function localParts(tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  })
  const p: Record<string, string> = {}
  for (const part of fmt.formatToParts(new Date())) p[part.type] = part.value
  // 'en-CA' con hour12:false a veces da '24' a medianoche → normaliza a 0
  const hour = Number(p.hour) % 24
  return { date: `${p.year}-${p.month}-${p.day}`, hour }
}

function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

function money(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  })
}

function summarize(movs: any[]): string {
  const total = movs.reduce((a, m) => a + Math.abs(m.amount), 0)
  const names = movs
    .slice(0, 3)
    .map((m) => m.name)
    .join(', ')
  const more = movs.length > 3 ? ` y ${movs.length - 3} más` : ''
  return `${money(total)} · ${names}${more}`
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('forbidden', { status: 403 })
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  for (const sub of subs ?? []) {
    const tz = sub.timezone || 'America/Mexico_City'
    const { date: today, hour } = localParts(tz)
    if (hour !== (sub.notify_hour ?? 9)) continue
    const tomorrow = addDaysISO(today, 1)

    const { data: snapRow } = await supabase
      .from('snapshots')
      .select('data')
      .eq('user_id', sub.user_id)
      .maybeSingle()
    const bundle: any = snapRow?.data
    if (!bundle) continue

    const scenarios = (bundle.scenarios ?? [])
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
    const primary = scenarios[0]?.id
    const gastos = (bundle.movements ?? []).filter(
      (m: any) =>
        m.included &&
        m.kind === 'delta' &&
        (m.amount < 0 || m.payCardId) &&
        m.date &&
        (!primary || m.scenarioId === primary),
    )
    const dueToday = gastos.filter((m: any) => m.date === today)
    const dueTomorrow = gastos.filter((m: any) => m.date === tomorrow)

    const notifications: { title: string; body: string; tag: string }[] = []
    if (dueToday.length)
      notifications.push({ title: 'Gastos de hoy', body: summarize(dueToday), tag: 'finanz-hoy' })
    if (dueTomorrow.length)
      notifications.push({
        title: 'Mañana toca',
        body: summarize(dueTomorrow),
        tag: 'finanz-manana',
      })

    for (const n of notifications) {
      try {
        await webpush.sendNotification(sub.subscription, JSON.stringify({ ...n, url: '.' }))
        sent++
      } catch (e: any) {
        // 404/410 → la suscripción ya no existe: bórrala
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      }
    }
  }
  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
