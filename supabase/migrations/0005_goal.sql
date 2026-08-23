-- 0005_goal.sql — M4: goal table, RLS.
--
-- One monthly sales target per trader. `month` is the 'YYYY-MM' string the
-- client already uses; the CHECK keeps it well-formed and UNIQUE prevents
-- two goals for the same month (upsert-on-month semantics live client-side).

create table public.goal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  target_usd_cents bigint not null check (target_usd_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, month)
);

comment on table public.goal is
  'Monthly sales target in USD cents, one row per (trader, month).';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger goal_touch_updated_at
  before update on public.goal
  for each row execute function public.touch_updated_at();

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.goal enable row level security;

create policy "goal_select_own" on public.goal
  for select using (auth.uid() = user_id);

create policy "goal_insert_own" on public.goal
  for insert with check (auth.uid() = user_id);

create policy "goal_update_own" on public.goal
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goal_delete_own" on public.goal
  for delete using (auth.uid() = user_id);
