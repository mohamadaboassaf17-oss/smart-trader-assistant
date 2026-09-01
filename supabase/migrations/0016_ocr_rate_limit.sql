-- 0016_ocr_rate_limit.sql — P1.2 OCR persistent rate limit (إصلاح استنزاف Map الوهمي)
--
-- Problem: M9 استخدم Map في الذاكرة (per isolate) لـ rate limit بالـ OCR.
--         Map وهمي: يُعاد ضبطه عند cold start / scaling، ولا يمنع استنزاف
--         حصة Google Vision (20$/mo) عبر إغراق متعمد من مستخدم واحد.
--
-- Fix: جدول ثابت public.ocr_rate_limit (user_id PK, window_start, count)
--      + دالة check_ocr_rate_limit للتحقق الذري. الـ Edge Function تقرأ
--      وتكتب عبر service_role (يتجاوز RLS) قبل استدعاء Vision وتُسجّل
--      الضربة (recordHit) قبل الاستدعاء لمنع الاستنزاف عبر الفشل المتعمد.
--      الحفاظ على transient (لا Storage) و verify_jwt=true.
--      لا سياسات لـ authenticated — service_role فقط.

create table if not exists public.ocr_rate_limit (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.ocr_rate_limit enable row level security;

-- service_role فقط — لا سياسات لـ authenticated (service_role يتجاوز RLS)
-- Intentionally no policies: service_role bypasses RLS; authenticated has no access.
comment on table public.ocr_rate_limit is 'P1.2 OCR rate limit 20 req/hour/user — service_role only, no authenticated policies (service_role bypasses RLS); transient Vision quota guard.';

create or replace function public.check_ocr_rate_limit(p_user_id uuid, p_limit int default 20)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ocr_rate_limit%rowtype;
begin
  select * into v_row from public.ocr_rate_limit where user_id = p_user_id;
  if not found then
    return false;
  end if;
  -- window 1h: إذا كان window_start داخل الساعة الأخيرة و count >= limit → تجاوز
  if v_row.window_start > now() - interval '1 hour' and v_row.count >= p_limit then
    return true;
  end if;
  return false;
end;
$$;

comment on function public.check_ocr_rate_limit(uuid, int) is 'P1.2: تتحقق window 1h وتعيد true إذا تجاوز المستخدم p_limit (افتراضي 20). تستخدم من supabaseAdmin قبل استدعاء Vision.';

-- Least privilege: service_role فقط (يتجاوز RLS أصلاً لكن نحصر التنفيذ)
revoke all on table public.ocr_rate_limit from public, authenticated, anon;
revoke all on function public.check_ocr_rate_limit(uuid, int) from public;
grant all on table public.ocr_rate_limit to service_role;
grant execute on function public.check_ocr_rate_limit(uuid, int) to service_role;
