-- 0013_fk_owner_check.sql — P0.3: IDOR via FK — enforce parent owner match.
--
-- Prevents Insecure Direct Object Reference where an attacker sets
-- supplier_id / product_id / obligation_id to a victim's row while
-- keeping user_id = auth.uid(). RLS alone only checks user_id on the
-- child row, not whether the referenced parent belongs to the same user.
-- These BEFORE triggers compare NEW.user_id with the parent's user_id
-- and raise 42501 (insufficient_privilege) on mismatch.
--
-- All functions are SECURITY DEFINER with SET search_path = public to
-- avoid search_path hijacking (Postgres 15 / Supabase best practice).
-- service_role bypasses RLS but still fires triggers — intentional.

-- ── Generic IDOR guard (TG_ARGV[0] = parent table name) ──────────────────
-- دالة عامة تأخذ اسم الجدول الأب كـ TG_ARGV[0] وتتحقق أن NEW.user_id
-- يساوي parent.user_id. تُستخدم كبديل للدوال الثلاث المنفصلة.
-- All functions use SECURITY DEFINER SET search_path=public.
create or replace function public.assert_parent_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_parent_table text := tg_argv[0];
  v_parent_id uuid;
  v_owner uuid;
  v_sql text;
begin
  -- SET search_path = public via SECURITY DEFINER clause
  if v_parent_table is null then
    raise exception 'assert_parent_owner: missing TG_ARGV[0] parent table name' using errcode = '42501';
  end if;

  -- Resolve NEW.parent_id dynamically based on TG_ARGV
  -- For known parents we read the corresponding FK column directly
  if v_parent_table = 'supplier' then
    v_parent_id := new.supplier_id;
  elsif v_parent_table = 'product' then
    v_parent_id := new.product_id;
  elsif v_parent_table = 'obligation' then
    v_parent_id := new.obligation_id;
  else
    raise exception 'assert_parent_owner: unknown parent table %', v_parent_table using errcode = '42501';
  end if;

  if v_parent_id is null then
    return new;
  end if;

  -- Dynamic lookup: SELECT user_id FROM parent WHERE id = NEW.parent_id
  v_sql := format('select user_id from public.%I where id = $1', v_parent_table);
  execute v_sql into v_owner using v_parent_id;

  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'parent owner mismatch' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.assert_parent_owner() is
  'Generic IDOR guard: compares NEW.user_id with SELECT user_id FROM parent WHERE id = NEW.parent_id (TG_ARGV[0]); raises parent owner mismatch 42501.';

-- ── goods_invoice → supplier ─────────────────────────────────────────────
create or replace function public.check_goods_invoice_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- SET search_path = public is enforced via SECURITY DEFINER clause above
  if new.supplier_id is null then
    return new;
  end if;

  select user_id into v_owner
  from public.supplier
  where id = new.supplier_id;

  -- parent missing or owner differs → reject
  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'parent owner mismatch: supplier % not owned by user %', new.supplier_id, new.user_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.check_goods_invoice_owner() is
  'IDOR guard: goods_invoice.supplier_id must belong to NEW.user_id; raises 42501 on mismatch.';

drop trigger if exists goods_invoice_owner_check on public.goods_invoice;
create trigger goods_invoice_owner_check
  BEFORE INSERT OR UPDATE ON public.goods_invoice
  FOR EACH ROW EXECUTE FUNCTION public.check_goods_invoice_owner();

-- ── inventory_move → product ─────────────────────────────────────────────
create or replace function public.check_inventory_move_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- SET search_path = public via SECURITY DEFINER
  if new.product_id is null then
    return new;
  end if;

  select user_id into v_owner
  from public.product
  where id = new.product_id;

  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'parent owner mismatch: product % not owned by user %', new.product_id, new.user_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.check_inventory_move_owner() is
  'IDOR guard: inventory_move.product_id must belong to NEW.user_id; raises 42501 on mismatch.';

drop trigger if exists inventory_move_owner_check on public.inventory_move;
create trigger inventory_move_owner_check
  BEFORE INSERT OR UPDATE ON public.inventory_move
  FOR EACH ROW EXECUTE FUNCTION public.check_inventory_move_owner();

-- ── obligation_payment → obligation ──────────────────────────────────────
create or replace function public.check_obligation_payment_owner()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  -- SET search_path = public via SECURITY DEFINER
  if new.obligation_id is null then
    return new;
  end if;

  select user_id into v_owner
  from public.obligation
  where id = new.obligation_id;

  if v_owner is null or v_owner is distinct from new.user_id then
    raise exception 'parent owner mismatch: obligation % not owned by user %', new.obligation_id, new.user_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.check_obligation_payment_owner() is
  'IDOR guard: obligation_payment.obligation_id must belong to NEW.user_id; raises 42501 on mismatch.';

drop trigger if exists obligation_payment_owner_check on public.obligation_payment;
create trigger obligation_payment_owner_check
  BEFORE INSERT OR UPDATE ON public.obligation_payment
  FOR EACH ROW EXECUTE FUNCTION public.check_obligation_payment_owner();
