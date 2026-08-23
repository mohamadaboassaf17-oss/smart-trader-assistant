-- 0008_product.sql — M5: product table, RLS.
--
-- PRD §6.4 notebook-style inventory: quantities are manually managed by the
-- trader; moves are audited in inventory_move, current stock lives here.

create table public.product (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  shelf_qty integer not null default 0 check (shelf_qty >= 0),
  warehouse_qty integer not null default 0 check (warehouse_qty >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product is
  'Tracked product with shelf/warehouse quantities; moves audited separately.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger product_touch_updated_at
  before update on public.product
  for each row execute function public.touch_updated_at();

-- Product lists filter owner first, then sort by name.
create index product_user_name_idx on public.product (user_id, name);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.product enable row level security;

create policy "product_select_own" on public.product
  for select using (auth.uid() = user_id);

create policy "product_insert_own" on public.product
  for insert with check (auth.uid() = user_id);

create policy "product_update_own" on public.product
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "product_delete_own" on public.product
  for delete using (auth.uid() = user_id);
