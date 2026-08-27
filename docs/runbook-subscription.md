# Runbook — إدارة الاشتراكات (Beta + M8 Stripe)

> PRD §4.4–§4.5 + M7 Beta Hardening + M8 Stripe. يشمل المسار اليدوي (Whish/OMT) والآلي (Stripe).

## 1. متى يُستخدم

- انتهت الفترة التجريبية (7 أيام) أو اشتراك شهر منتهٍ.
- التاجر حوّل 20$ عبر **Whish Money** أو **OMT** وأرسل لقطة شاشة عبر واتساب/بريد.
- **لا تلمس** `profiles` قبل تأكيد الدفع.

## 2. المتطلبات

- وصول Owner إلى مشروع Supabase (Dashboard).
- معرف المستخدم `user_id` (UUID) أو بريده — يُستخرج من `auth.users` أو من رسالة التاجر.

## 3. خطوات التجديد (Dashboard)

### 3.1 العثور على المستخدم

1. Supabase → **Authentication → Users** → ابحث بالبريد/الهاتف → انسخ `UID`.
2. أو **Table Editor → profiles** → فلتر `id = UID`.

### 3.2 التحديث

- حقلان فقط:
  - `subscription_status` = `active`
  - `subscription_expires_at` = تاريخ بعد **30 يوماً من الآن** بصيغة ISO (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- مثال SQL (شغّله في **SQL Editor**):

```sql
-- جدّد اشتراك تاجر لمدة 30 يوماً
update public.profiles
set subscription_status = 'active',
    subscription_expires_at = now() + interval '30 days',
    updated_at = now()
where id = 'PUT-USER-UUID-HERE'
returning id, subscription_status, subscription_expires_at;
```

- للتجربة المجانية الجديدة (إعادة تعيين):

```sql
update public.profiles
set subscription_status = 'trial',
    subscription_expires_at = now() + interval '7 days',
    updated_at = now()
where id = 'PUT-USER-UUID-HERE'
returning *;
```

### 3.3 التحقق

- الصف المُحدَّث يظهر `subscription_expires_at` في المستقبل.
- افتح التطبيق على جهاز التاجر → اتصل بالإنترنت → انتظر مزامنة واحدة.
- `useSubscription.ts:74-96` `evaluateAfterSync()` يقرأ الصف من `profiles`، يمسح `EXPIRED_CONFIRMED_KEY` ويفك القفل؛ الشارة تختفي والـ banner للـ grace (≤ يومين) يظهر فقط عند الاقتراب.

## 4. فترة السماح (Grace) والقفل

- `src/utils/subscription.ts` — نافذة السماح 2 يوم قبل الانتهاء → بانر “اشتراكك ينتهي خلال {days} يوم”.
- القفل ينشط **فقط بعد مزامنة online ناجحة** تثبت `subscriptionState === 'expired'` (`src/composables/useSubscription.ts:88-90`). الجهاز الـ offline يبقى يعمل بلا قفل حتى يتصل.
- `EXPIRED_CONFIRMED_KEY = 'subscription.expiredConfirmedOnline'` محفوظة في `session` IndexedDB كي يبقى القفل عبر إعادة التشغيل الباردة.

## 5. استكشاف الأخطاء

| عرض                                        | سبب محتمل                                                                                             | إجراء                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| لا يزال مقفلاً بعد التحديث                 | الجهاز لم يزامن بعد                                                                                   | اطلب من التاجر فتح التطبيق على الإنترنت + إعادة تحميل |
| `subscription_expires_at` null             | نسيت ضبط الحقل                                                                                        | أعد التحديث بـ `now()+30 days`                        |
| يظهر banner رغم كونه active                | التاريخ خلال يومين من الانتهاء → طبيعي                                                                | لا شيء                                                |
| دفع عبر Stripe ولم يُفعّل                  | تحقق من `stripe_event` و logs للـ Edge Function `stripe-webhook`؛ أعد إرسال الحدث من Stripe Dashboard | راجع §8                                               |
| `No Stripe customer linked` عند فتح Portal | التاجر لم يدفع عبر Stripe بعد (Whish/OMT فقط)                                                         | استخدم Portal فقط بعد أول دفع Stripe                  |

## 5.1 مسار Stripe الآلي (M8)

- **المنتج:** Stripe Dashboard → Product `Smart Trader Assistant — Pro` + Price `$20 USD / month` (`price_...`) — حساب `billing@smart-tajir.com` على الكيان الأجنبي.
- **Webhook:** `https://<ref>.supabase.co/functions/v1/stripe-webhook` (Edge Function `supabase/functions/stripe-webhook/index.ts:1` — `verify_jwt=false`، يتحقق من `stripe-signature` + يكتب `stripe_event` للـ idempotency).
- **المتغيرات المطلوبة في Supabase Secrets:**
  ```
  supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_... APP_URL=https://smart-tajir.com STRIPE_PRICE_ID=price_... SUPABASE_SERVICE_ROLE_KEY=...
  ```
- **الأحداث المعالجة:** `checkout.session.completed` → `active` + `stripe_customer_id` + `subscription_expires_at = current_period_end`؛ `customer.subscription.updated/created` → ترجمة `status`؛ `customer.subscription.deleted → expired`؛ `invoice.payment_succeeded → تمديد`؛ `invoice.payment_failed → لا قفل فوري` (يبقى `active` حتى نهاية الفترة).
- **حماية السباق اليدوي:** الـ webhook يستخدم `GREATEST(subscription_expires_at, new)` — لا يحرّك الانتهاء للخلف إذا كان التجديد اليدوي أحدث (`supabase/functions/stripe-webhook/index.ts:44-78`).
- **الاختبار المحلي:**
  ```bash
  stripe login
  stripe listen --forward-to http://localhost:54321/functions/v1/stripe-webhook
  stripe trigger checkout.session.completed
  ```

## 5.2 تسوية Whish/OMT مع Stripe (M8 — dual mode)

`VITE_PAYMENT_MODE=dual` افتراضي — يظهر كلا المسارين في `src/features/subscription/RenewalView.vue:95-182`. عندما يدفع تاجر عبر Whish/OMT بعد تفعيل Stripe:

```sql
-- لا يزال يعمل — الـ webhook لن يطغى لأنه GREATEST
update public.profiles
set subscription_status='active',
    subscription_expires_at = now() + interval '30 days',
    updated_at = now()
where id = 'PUT-USER-UUID-HERE'
returning id, subscription_status, subscription_expires_at, stripe_customer_id;
```

إذا انتقل التاجر لاحقاً للدفع عبر Stripe، سيُربط `stripe_customer_id` تلقائياً عند أول `checkout.session.completed` (عبر `client_reference_id`).

## 6. قالب تتبع البيتا (انسخه إلى Notion / Google Sheet)

> المؤسس يدعو 10–20 تاجراً (LB+SY) عبر واتساب. لا تشارك PII في المستودع — هذا القالب بنية فقط.

| #   | اسم التاجر     | الدولة (LB/SY) | الجهاز (موديل/Android+iOS)  | تاريخ الانضمام | وقت الإدخال اليومي (ث) | ضمن <3 دق؟ | الأخطاء/الملاحظات | حالة الاشتراك (trial/active/expired) | تاريخ الانتهاء |
| --- | -------------- | -------------- | --------------------------- | -------------- | ---------------------- | ---------- | ----------------- | ------------------------------------ | -------------- |
| 1   | مثال: أبو أحمد | LB             | Tecno Spark 20 / Android 14 | 2026-09-01     | 142                    | نعم        | FAB يغطي الزر     | trial                                | 2026-09-08     |
| 2   |                |                |                             |                |                        |            |                   |                                      |                |

### حقول نموذج Google Form المقترحة

- الاسم (اختياري) / الدولة / نوع الجهاز / وقت الإدخال اليومي (بالثواني) / هل واجهت خطأ؟ (نعم/لا) / وصف الخطأ / لقطة شاشة (اختياري) / اقتراح.

## 7. مصادر

- `src/composables/useSubscription.ts:1-121`
- `src/services/sync/flush.ts:51-114` (سلوك 23505)
- `src/config/contact.ts` — أرقام Whish/OMT وروابط `wa.me`/`mailto:`
- `src/config/payment.ts` — `VITE_PAYMENT_MODE` + `VITE_STRIPE_PRICE_ID` (M8)
- `src/services/stripe/stripe.ts` — Checkout + Portal (M8)
- `supabase/functions/stripe-webhook/index.ts` + `create-checkout-session` + `create-portal-session` (M8 Edge Functions)
- `supabase/migrations/0012_stripe.sql` — أعمدة Stripe + `stripe_event`
- PRD §4.3 جدول الاشتراك، §4.4 مسار Whish/OMT، §10 مقاييس النجاح

## 8. إيقاف الدفع اليدوي (Sunset — M8 قرار)

- `VITE_PAYMENT_MODE=dual` افتراضي في M8.
- الإخفاء النهائي لليدوي عند **تجاوز 80% تحويل Stripe لـ 4 أسابيع متتالية** — غيّر في Vercel → Environment Variables: `VITE_PAYMENT_MODE=stripe` ثم Redeploy.
- `src/config/payment.ts:15-27` يتحكم بالعرض: `showStripe` / `showManual`. لا تحذف كود Whish/OMT في M8 — الإخفاء واجهة فقط.
- للطوارئ: `VITE_PAYMENT_MODE=manual` يعيد اليدوي فقط.
