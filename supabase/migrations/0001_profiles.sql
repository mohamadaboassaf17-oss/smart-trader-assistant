-- 0001_profiles.sql — M3: profiles table, RLS, trial defaults.
--
-- One profile per auth user (PK = user id). The client upserts the row
-- during onboarding (id = auth.uid()); a BEFORE INSERT trigger guarantees
-- trial fields even if the client omits them.

create type user_country as enum ('LB', 'SY');

create type local_currency as enum ('LBP', 'SYP');

create type subscription_status as enum ('trial', 'active', 'expired');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  country user_country not null,
  local_currency local_currency not null,
  subscription_status subscription_status not null default 'trial',
  subscription_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per trader: market + subscription state. PK = auth.users.id.';

-- Trial on first create: 7 days unless the insert already carries values.
create or replace function public.set_trial_on_first_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.subscription_status is null then
    new.subscription_status := 'trial';
  end if;
  if new.subscription_expires_at is null then
    new.subscription_expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

create trigger profiles_set_trial
  before insert on public.profiles
  for each row execute function public.set_trial_on_first_profile();

-- Keep updated_at fresh on every write (sync engine compares it).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── RLS: owner-only access ─────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);
