-- 0015_subscription_greatest.sql — P0.5 Fix: atomic GREATEST for subscription expiry
--
-- Problem: applyProfileUpdate did fetch-then-compare (non-atomic). Two concurrent
-- webhooks or a manual renewal interleaving could lost-update and move expiry
-- backwards (Stripe out-of-order delivery after a fresher manual renewal).
--
-- Fix: single atomic UPDATE via RPC advance_subscription that uses GREATEST on
-- the DB side. Mirrors the spec SQL:
--   UPDATE public.profiles
--   SET subscription_status = EXCLUDED.subscription_status,
--       subscription_expires_at = GREATEST(profiles.subscription_expires_at, EXCLUDED.subscription_expires_at),
--       updated_at = now()
--   WHERE id = EXCLUDED.id
-- Wrapped in a SECURITY DEFINER function so the Edge Function (service_role)
-- can call it via supabaseAdmin.rpc('advance_subscription', {...}).

create or replace function public.advance_subscription(
  p_user_id uuid,
  p_status text,
  p_expires_at timestamptz,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cast p_status to the enum; will error on invalid value (fail-closed).
  update public.profiles
  set
    subscription_status = p_status::public.subscription_status,
    subscription_expires_at = case
      when p_expires_at is null then profiles.subscription_expires_at
      else greatest(
        coalesce(profiles.subscription_expires_at, '1970-01-01'::timestamptz),
        p_expires_at
      )
    end,
    stripe_customer_id = coalesce(p_customer_id, profiles.stripe_customer_id),
    stripe_subscription_id = coalesce(p_subscription_id, profiles.stripe_subscription_id),
    stripe_price_id = coalesce(p_price_id, profiles.stripe_price_id),
    updated_at = coalesce(p_updated_at, now())
  where id = p_user_id;

  if not found then
    raise warning 'advance_subscription: no profile for user % — skipping (profiles PK requires country/local_currency, stub not created)', p_user_id;
  end if;
end;
$$;

comment on function public.advance_subscription(uuid, text, timestamptz, text, text, text, timestamptz)
  is 'Atomic GREATEST guard for stripe-webhook (P0.5): never moves subscription_expires_at backwards; coalesces stripe ids; SECURITY DEFINER for Edge Function service_role.';

-- Edge Function uses service_role; also allow authenticated for local testing.
revoke all on function public.advance_subscription(uuid, text, timestamptz, text, text, text, timestamptz) from public;
grant execute on function public.advance_subscription(uuid, text, timestamptz, text, text, text, timestamptz) to service_role, authenticated;
