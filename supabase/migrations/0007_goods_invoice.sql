-- 0007_goods_invoice.sql — M5: goods_invoice table, RLS.
--
-- An invoice for goods received from a supplier (PRD §6.3). Money is stored
-- as integer cents; USD is canonical. debt_usd_cents = total − paidCash is
-- persisted so the supplier balance derivation reads a single column.

create table public.goods_invoice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  supplier_id uuid not null references public.supplier (id) on delete cascade,
  date date not null,
  total_usd_cents bigint not null check (total_usd_cents >= 0),
  paid_cash_usd_cents bigint not null check (paid_cash_usd_cents >= 0),
  debt_usd_cents bigint not null check (debt_usd_cents >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mirrors the client guard computeDebtUsdCents in src/utils/invoice-math.ts
  -- (overpay rejection), keeping DB and app rules identical.
  constraint goods_invoice_paid_within_total
    check (paid_cash_usd_cents <= total_usd_cents)
);

comment on table public.goods_invoice is
  'Goods invoice from a supplier: total/paid/debt in USD cents, debt derived.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger goods_invoice_touch_updated_at
  before update on public.goods_invoice
  for each row execute function public.touch_updated_at();

-- Day-scoped reads filter owner first, then date (mirrors sale_user_date_idx).
create index goods_invoice_user_date_idx on public.goods_invoice (user_id, date);

-- Supplier balance derivation sums debts per supplier ordered by date.
create index goods_invoice_supplier_date_idx on public.goods_invoice (supplier_id, date);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.goods_invoice enable row level security;

create policy "goods_invoice_select_own" on public.goods_invoice
  for select using (auth.uid() = user_id);

create policy "goods_invoice_insert_own" on public.goods_invoice
  for insert with check (auth.uid() = user_id);

create policy "goods_invoice_update_own" on public.goods_invoice
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goods_invoice_delete_own" on public.goods_invoice
  for delete using (auth.uid() = user_id);
