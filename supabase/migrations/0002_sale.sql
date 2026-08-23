-- 0002_sale.sql — M4: sale table, RLS.
--
-- The core daily sales entry (PRD §6.1). Money is stored as integer cents;
-- USD is canonical and local amounts are kept next to the rate captured that
-- day so history stays stable when rates move. total_usd_cents is computed
-- client-side (tasks.md M4: cash_usd + round(cash_local / rate)) and pushed
-- by the sync engine as a full row upsert.

create table public.sale (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  cash_usd_cents bigint not null,
  cash_local_cents bigint not null,
  exchange_rate numeric not null check (exchange_rate > 0),
  total_usd_cents bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sale is
  'Daily sales entry: USD + local cash in cents, rate snapshot, USD total.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger sale_touch_updated_at
  before update on public.sale
  for each row execute function public.touch_updated_at();

-- Day-scoped reads (history strip, dashboards) filter owner first, then date.
create index sale_user_date_idx on public.sale (user_id, date);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.sale enable row level security;

create policy "sale_select_own" on public.sale
  for select using (auth.uid() = user_id);

create policy "sale_insert_own" on public.sale
  for insert with check (auth.uid() = user_id);

create policy "sale_update_own" on public.sale
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "sale_delete_own" on public.sale
  for delete using (auth.uid() = user_id);
