-- 0011_obligation_payment.sql — M6: obligation_payment table, RLS.
--
-- Per-month payment STATUS for an obligation (PRD §6.5). Payment stores
-- STATUS ONLY — the amount is derived client-side from the parent
-- obligation at render/net-calculation time (deliberate design, mirrors
-- ObligationPayment in src/types/domain.ts).
--
-- The UNIQUE (user_id, obligation_id, month) constraint is what makes
-- client-side monthly generation idempotent under multi-device sync: a
-- re-insert for the same (trader, obligation, month) fails instead of
-- duplicating. When a trader deletes an obligation the client deletes its
-- payments first locally, then the parent — ON DELETE CASCADE here covers
-- any stragglers server-side.

create type obligation_status as enum ('pending', 'paid');

create table public.obligation_payment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  obligation_id uuid not null references public.obligation (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),   -- 'YYYY-MM'
  status obligation_status not null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Idempotency under multi-device sync (rationale in the file header).
  constraint obligation_payment_month_unique unique (user_id, obligation_id, month)
);

comment on table public.obligation_payment is
  'Monthly status for an obligation (PRD §6.5); amount derived from the parent.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger obligation_payment_touch_updated_at
  before update on public.obligation_payment
  for each row execute function public.touch_updated_at();

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.obligation_payment enable row level security;

create policy "obligation_payment_select_own" on public.obligation_payment
  for select using (auth.uid() = user_id);

create policy "obligation_payment_insert_own" on public.obligation_payment
  for insert with check (auth.uid() = user_id);

create policy "obligation_payment_update_own" on public.obligation_payment
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "obligation_payment_delete_own" on public.obligation_payment
  for delete using (auth.uid() = user_id);
