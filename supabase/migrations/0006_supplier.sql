-- 0006_supplier.sql — M5: supplier table, RLS.
--
-- A supplier of goods received on invoice (PRD §6.3). NO balance column —
-- balance is derived client-side by summing goods_invoice.debt_usd_cents per
-- supplier (owner decision 2026-08-23), see @/utils/supplier-balance.

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.supplier is
  'Supplier of goods; no balance stored — derived from goods_invoice debts.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger supplier_touch_updated_at
  before update on public.supplier
  for each row execute function public.touch_updated_at();

-- Supplier lists filter owner first, then sort by name.
create index supplier_user_name_idx on public.supplier (user_id, name);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.supplier enable row level security;

create policy "supplier_select_own" on public.supplier
  for select using (auth.uid() = user_id);

create policy "supplier_insert_own" on public.supplier
  for insert with check (auth.uid() = user_id);

create policy "supplier_update_own" on public.supplier
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "supplier_delete_own" on public.supplier
  for delete using (auth.uid() = user_id);
