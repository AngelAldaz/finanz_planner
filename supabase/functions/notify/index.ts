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
  // { force: true } en el body → ignora la hora de aviso (para probar a mano con curl)
  let force = false
  try {
    const body = await req.json()
    force = body?.force === true
  } catch {
    /* sin body o no-JSON: normal cuando lo llama el cron */
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data: subs, error } = await supabase.from('push_subscriptions').select('*')
  if (error) {
    console.error('push_subscriptions:', error.message)
    return new Response(error.message, { status: 500 })
  }

  const stats = { subs: subs?.length ?? 0, matched: 0, sent: 0, errors: 0, removed: 0 }
  const log: string[] = []
  for (const sub of subs ?? []) {
    const tz = sub.timezone || 'America/Mexico_City'
    const { date: today, hour } = localParts(tz)
    const short = String(sub.endpoint).slice(-12)
    if (!force && hour !== (sub.notify_hour ?? 9)) {
      log.push(`…${short}: hora local ${hour} ≠ aviso ${sub.notify_hour ?? 9} (${tz}), skip`)
      continue
    }
    stats.matched++
    const tomorrow = addDaysISO(today, 1)

    const { data: snapRow, error: snapErr } = await supabase
      .from('snapshots')
      .select('data')
      .eq('user_id', sub.user_id)
      .maybeSingle()
    if (snapErr) log.push(`…${short}: snapshot error ${snapErr.message}`)
    const bundle: any = snapRow?.data
    if (!bundle) {
      log.push(`…${short}: sin snapshot para user ${sub.user_id}`)
      continue
    }

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
    log.push(
      `…${short}: ${today} (${tz}) · movs=${(bundle.movements ?? []).length} gastos-con-fecha=${gastos.length} hoy=${dueToday.length} mañana=${dueTomorrow.length}`,
    )

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
        stats.sent++
        log.push(`…${short}: enviada "${n.title}"`)
      } catch (e: any) {
        stats.errors++
        const code = e?.statusCode
        log.push(
          `…${short}: ERROR ${code ?? '?'} ${String(e?.body ?? e?.message ?? e).slice(0, 200)}`,
        )
        // 404/410 → la suscripción ya no existe: bórrala
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          stats.removed++
        }
      }
    }
  }
  for (const line of log) console.log(line)
  return new Response(JSON.stringify({ ...stats, force, log }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
