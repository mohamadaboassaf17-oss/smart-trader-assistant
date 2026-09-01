# إعداد النطاق smart-tajir.com — M8

> الهدف: `smart-tajir.com` هو النطاق الأساسي، `smart-trader-assistant.vercel.app` يبقى احتياطياً مع إعادة توجيه 308.

## 1. الشراء

- **المفضل:** Cloudflare Registrar (سعر التكلفة + DNS فوري + HTTPS تلقائي).
- **البديل:** Namecheap → غيّر nameservers إلى Cloudflare (`*.ns.cloudflare.com`) للاستفادة من حماية Cloudflare.

## 2. ربط Vercel

1. Vercel Dashboard → Project `smart-trader-assistant` → Settings → Domains → Add `smart-tajir.com` + `www.smart-tajir.com`.
2. انسخ السجلات التي يظهرها Vercel:
   - Apex: `A 76.76.21.21` أو `CNAME cname.vercel-dns.com` (حسب اختيار Vercel الحالي).
   - `www`: `CNAME cname.vercel-dns.com`.
3. في Cloudflare → SSL/TLS → Overview: ضع `SSL/TLS → Full (Strict)`، وفعّل `Always Use HTTPS ON` و `Automatic HTTPS Rewrites ON`.
4. أضفها في Cloudflare DNS (Proxy **OFF** للتحقق الأول، ثم ON بعد نجاح التحقق).
5. انتظر التحقق (عادة <5 دقائق) + شهادة TLS تلقائية من Vercel/Let's Encrypt.

## 3. إعادة التوجيه

`vercel.json` في الجذر يطبّق:

- `smart-trader-assistant.vercel.app/* → https://smart-tajir.com/* 308`
- `www.smart-tajir.com/* → https://smart-tajir.com/* 308`

اختبر بعد النشر: `curl -I https://smart-trader-assistant.vercel.app/` يجب أن يرجع `308 Location: https://smart-tajir.com/`.

## 4. متغيرات البيئة

في Vercel → Settings → Environment Variables (Production + Preview):

```
VITE_APP_URL=https://smart-tajir.com
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_STRIPE_PRICE_ID=price_...
VITE_PAYMENT_MODE=dual
```

## 5. PWA

`vite.config.ts` الـ `scope/start_url` تبقى `/` — لا تغيير. بعد تغيير النطاق، امسح cache المتصفح مرة واحدة للتحقق من `manifest` الجديد.

## 6. البريد

حساب Stripe: `billing@smart-tajir.com` — أنشئه كـ alias في مزود البريد (Cloudflare Email Routing أو Google Workspace).
