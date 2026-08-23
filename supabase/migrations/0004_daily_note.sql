-- 0004_daily_note.sql — M4: daily_note table, RLS.
--
-- Free-form end-of-day note. Multiple notes per day are allowed (the Notes
-- screen lists them); each row stands alone with its own UUID.

create table public.daily_note (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.daily_note is
  'Free-form note attached to a business day.';

-- Reuses public.touch_updated_at() from 0001_profiles.sql.
create trigger daily_note_touch_updated_at
  before update on public.daily_note
  for each row execute function public.touch_updated_at();

-- Day-scoped reads (notes screen) filter owner first, then date.
create index daily_note_user_date_idx on public.daily_note (user_id, date);

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.daily_note enable row level security;

create policy "daily_note_select_own" on public.daily_note
  for select using (auth.uid() = user_id);

create policy "daily_note_insert_own" on public.daily_note
  for insert with check (auth.uid() = user_id);

create policy "daily_note_update_own" on public.daily_note
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_note_delete_own" on public.daily_note
  for delete using (auth.uid() = user_id);
