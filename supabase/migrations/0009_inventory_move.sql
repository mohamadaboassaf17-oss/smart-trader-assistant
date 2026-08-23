-- 0009_inventory_move.sql — M5: inventory_move table, RLS.
--
-- Audit trail of quantity moves between shelf and warehouse (PRD §6.4).
-- Current quantities live on the product row; this table only records what
-- happened, when.

create table public.inventory_move (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete cascade,
  -- Direction values stay camelCase intentionally: the sync engine converts
  -- object KEYS only; string VALUES pass through unchanged.
  direction text not null
    check (direction in ('shelfToWarehouse', 'warehouseToShelf')),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inventory_move is
  'Audit trail only — current quantities live on the product row.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger inventory_move_touch_updated_at
  before update on public.inventory_move
  for each row execute function public.touch_updated_at();

-- Product detail views load a product's move history.
create index inventory_move_product_idx on public.inventory_move (product_id);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.inventory_move enable row level security;

create policy "inventory_move_select_own" on public.inventory_move
  for select using (auth.uid() = user_id);

create policy "inventory_move_insert_own" on public.inventory_move
  for insert with check (auth.uid() = user_id);

create policy "inventory_move_update_own" on public.inventory_move
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "inventory_move_delete_own" on public.inventory_move
  for delete using (auth.uid() = user_id);
