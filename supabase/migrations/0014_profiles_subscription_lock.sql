-- 0014_profiles_subscription_lock.sql — P0.4: lock billing columns from client writes.
--
-- الهدف: منع العميل (authenticated) من تعديل أعمدة الفوترة مباشرة.
-- الأعمدة المحمية: subscription_status, subscription_expires_at,
-- stripe_customer_id, stripe_subscription_id, stripe_price_id
-- الكتابة مسموحة فقط عبر service_role (Edge Function للويبهوك).
--
-- ملاحظة هامة / Important: service_role يتجاوز RLS تماماً (bypasses RLS)
-- لذلك الويبهوك الذي يستخدم service_role يستطيع تحديث أعمدة الفوترة
-- حتى مع وجود هذه السياسة. السياسة تقيد دور authenticated فقط.
--
-- التنفيذ يجمع دفاعين:
-- 1) سياسة RLS (profiles_update_own_safe) تتحقق أن الأعمدة المحمية لم تتغير
--    عبر مقارنة القيمة الجديدة بالقيمة القديمة المخزنة (IS NOT DISTINCT FROM + subquery)
-- 2) Trigger دفاعي إضافي (defense-in-depth) يطبق نفس القاعدة عبر NEW/OLD
--    ويرفع 42501 إن حاول العميل تعديل الفوترة.

-- ── 1) RLS: احذف السياسة القديمة المفتوحة ──────────────────────────────────
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_own_safe" on public.profiles;

-- سياسة آمنة: تسمح للمالك بتحديث صفه فقط إذا بقيت أعمدة الفوترة دون تغيير
-- WITH CHECK يضمن NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status
-- عبر إعادة قراءة القيمة القديمة بـ subquery (الطريقة المعتمدة في Supabase).
-- service_role bypasses RLS — no check needed for webhook.
create policy "profiles_update_own_safe" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and subscription_status is not distinct from (
      select p.subscription_status from public.profiles p where p.id = profiles.id
    )
    and subscription_expires_at is not distinct from (
      select p.subscription_expires_at from public.profiles p where p.id = profiles.id
    )
    and stripe_customer_id is not distinct from (
      select p.stripe_customer_id from public.profiles p where p.id = profiles.id
    )
    and stripe_subscription_id is not distinct from (
      select p.stripe_subscription_id from public.profiles p where p.id = profiles.id
    )
    and stripe_price_id is not distinct from (
      select p.stripe_price_id from public.profiles p where p.id = profiles.id
    )
  );

comment on policy "profiles_update_own_safe" on public.profiles is
  'P0.4: owner can update own profile but billing columns (subscription_status, subscription_expires_at, stripe_*) must stay IS NOT DISTINCT FROM old row; service_role bypasses RLS.';

-- ── 2) Trigger دفاعي: يمنع كتابة الفوترة من العميل حتى لو تم تجاوز RLS ─────
-- This trigger enforces the same rule via NEW / OLD comparison:
-- NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status etc.
-- and raises 42501 on violation. service_role is exempt.
create or replace function public.protect_profiles_billing_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- SET search_path = public via SECURITY DEFINER
  -- service_role bypass — allow webhook / admin to write billing columns
  -- current_user or auth.role() or JWT claim may indicate service_role
  if current_user = 'service_role'
     or coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
  then
    return new;
  end if;

  -- NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status pattern
  -- If any billing column changed by a non-service_role caller → reject
  if new.subscription_status is distinct from old.subscription_status
     or new.subscription_expires_at is distinct from old.subscription_expires_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     or new.stripe_price_id is distinct from old.stripe_price_id
  then
    raise exception 'billing columns are not writable by client: subscription_status, subscription_expires_at, stripe_customer_id, stripe_subscription_id, stripe_price_id'
      using errcode = '42501';
  end if;

  -- Explicit check mirrors policy WITH CHECK:
  -- WITH CHECK (NEW.stripe_customer_id IS NOT DISTINCT FROM OLD.stripe_customer_id)
  -- WITH CHECK (NEW.subscription_status IS NOT DISTINCT FROM OLD.subscription_status)
  -- WITH CHECK (NEW.subscription_expires_at IS NOT DISTINCT FROM OLD.subscription_expires_at)
  return new;
end;
$$;

comment on function public.protect_profiles_billing_columns() is
  'P0.4 defense-in-depth: blocks client writes to billing columns; service_role exempt; raises 42501.';

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row execute function public.protect_profiles_billing_columns();
