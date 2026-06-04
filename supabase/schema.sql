-- finanz · esquema de nube (Supabase). Pega esto en el SQL Editor y corre.
-- Un snapshot (bundle completo) por usuario, protegido por RLS.

create table if not exists public.snapshots (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.snapshots enable row level security;

create policy "select propio"
  on public.snapshots for select
  using (auth.uid() = user_id);

create policy "insert propio"
  on public.snapshots for insert
  with check (auth.uid() = user_id);

create policy "update propio"
  on public.snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
