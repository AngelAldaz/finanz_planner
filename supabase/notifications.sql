-- Tabla de suscripciones Web Push (una fila por navegador/dispositivo).
-- Corre esto UNA vez en Supabase → SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  timezone text,
  notify_hour int not null default 9,
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- cada quien administra solo sus suscripciones (la Edge Function usa service_role y las lee todas)
create policy "own subs select" on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy "own subs insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy "own subs update" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own subs delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- CRON: llama a la Edge Function `notify` cada hora en punto. La función decide,
-- por cada suscripción, si es su hora local de aviso. Reemplaza <REF> y <SECRET>.
-- Requiere las extensiones pg_cron y pg_net (Database → Extensions).
-- ─────────────────────────────────────────────────────────────────────────────
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule('finanz-notify-hourly', '0 * * * *', $$
--   select net.http_post(
--     url := 'https://<REF>.supabase.co/functions/v1/notify',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<SECRET>'),
--     body := '{}'::jsonb
--   );
-- $$);
--
-- Para quitarlo:  select cron.unschedule('finanz-notify-hourly');
