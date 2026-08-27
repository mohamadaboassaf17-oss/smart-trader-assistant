-- 0010_obligation.sql — M6: obligation table, RLS.
--
-- A recurring obligation (rent, electricity, phone…) per PRD §6.5. Amount is
-- stored as integer USD cents; due_day (1–31) drives the client-side monthly
-- generation of obligation_payment rows (see 0011). When the trader deletes
-- an obligation the client deletes its payment rows first locally, then the
-- parent — the FK cascade below covers any stragglers server-side.

create table public.obligation (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) > 0),
  amount_usd_cents bigint not null check (amount_usd_cents >= 0),
  due_day int not null check (due_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.obligation is
  'Recurring obligation (PRD §6.5): monthly amount in USD cents, due day 1–31.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger obligation_touch_updated_at
  before update on public.obligation
  for each row execute function public.touch_updated_at();

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.obligation enable row level security;

create policy "obligation_select_own" on public.obligation
  for select using (auth.uid() = user_id);

create policy "obligation_insert_own" on public.obligation
  for insert with check (auth.uid() = user_id);

create policy "obligation_update_own" on public.obligation
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "obligation_delete_own" on public.obligation
  for delete using (auth.uid() = user_id);
