-- 0012_stripe.sql — M8: Stripe columns on profiles + idempotency table for webhooks.
--
-- Adds link columns so the Stripe webhook (Edge Function) can map
-- Stripe customer/subscription → Supabase user. The app's existing
-- subscription logic (subscription_status + subscription_expires_at)
-- remains the canonical expiry checked by src/utils/subscription.ts
-- and src/composables/useSubscription.ts — the webhook only WRITES
-- those two fields (taking GREATEST to not overwrite a fresher manual
-- renewal from docs/runbook-subscription.md).
--
-- stripe_event is the idempotency log: one row per Stripe event.id
-- so retried webhooks are no-ops. RLS denies all client access;
-- only service_role (Edge Function) can read/write it.

-- ── profiles: Stripe link columns ────────────────────────────────────────
alter table public.profiles
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text unique,
  add column if not exists stripe_price_id text;

comment on column public.profiles.stripe_customer_id is
  'Stripe customer id (cus_...) for this trader — set by webhook on checkout.session.completed';
comment on column public.profiles.stripe_subscription_id is
  'Stripe subscription id (sub_...) — current $20/mo subscription';
comment on column public.profiles.stripe_price_id is
  'Stripe price id (price_...) — the $20/mo price this trader is on';

-- ── stripe_event: webhook idempotency log ────────────────────────────────
create table if not exists public.stripe_event (
  id text primary key, -- Stripe event.id, e.g. evt_1...
  type text not null,  -- e.g. checkout.session.completed
  created_at timestamptz not null default now()
);

comment on table public.stripe_event is
  'Idempotency log for Stripe webhooks (M8) — one row per Stripe event.id; service_role only.';

alter table public.stripe_event enable row level security;

-- Deny all client roles — only service_role bypasses RLS.
drop policy if exists "stripe_event_none" on public.stripe_event;
create policy "stripe_event_none" on public.stripe_event
  for all using (false) with check (false);

-- Also explicitly deny anon/authenticated via separate policies is redundant
-- once RLS is enabled and no permissive policy allows them, but the single
-- always-false policy above documents intent clearly.
