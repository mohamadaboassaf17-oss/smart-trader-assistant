-- 0003_side_purchase.sql — M4: side_purchase table, RLS.
--
-- Non-goods expense (transport, tea, petty cash — PRD §6.2). `amount_cents`
-- is expressed in `currency`; the rate snapshot converts it to USD cents at
-- entry time so later rate moves never rewrite history.
--
-- The currency CHECK mirrors `CurrencyCode` in src/types/domain.ts exactly
-- ('USD' | 'LBP' | 'SYP' | 'EUR' | 'GBP'); keep both in sync.

create table public.side_purchase (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  amount_cents bigint not null,
  currency text not null check (currency in ('USD', 'LBP', 'SYP', 'EUR', 'GBP')),
  exchange_rate numeric not null check (exchange_rate > 0),
  amount_usd_cents bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.side_purchase is
  'Non-goods expense: cents in a given currency + USD conversion snapshot.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger side_purchase_touch_updated_at
  before update on public.side_purchase
  for each row execute function public.touch_updated_at();

-- Day-scoped reads (recent list, dashboards) filter owner first, then date.
create index side_purchase_user_date_idx on public.side_purchase (user_id, date);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.side_purchase enable row level security;

create policy "side_purchase_select_own" on public.side_purchase
  for select using (auth.uid() = user_id);

create policy "side_purchase_insert_own" on public.side_purchase
  for insert with check (auth.uid() = user_id);

create policy "side_purchase_update_own" on public.side_purchase
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "side_purchase_delete_own" on public.side_purchase
  for delete using (auth.uid() = user_id);
