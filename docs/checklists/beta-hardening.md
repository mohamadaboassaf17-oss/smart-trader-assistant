# Beta Hardening — قائمة تحقق M7

تحقق يدوي قبل إرسال الدعوات. كل بند → ✅ / ❌ مع رابط PR أو لقطة.

## Thumb-zone (PRD §8)

- [ ] FAB المشتريات الجانبية داخل الثلث السفلي على 360×640 و 390×844 و 412×915 (`QuickSidePurchase.vue:239` `safe-area-inset-bottom`)
- [ ] زر حفظ المبيعات فوق الـ nav (`SalesView.vue:300` + `AppShell.vue:120` padding)
- [ ] قياس زمن الإدخال: بيع+مشتريات+ملاحظات <180 ث (`daily-entry-offline.spec` + `performance.mark` في `SalesView.vue`)

## Accessibility

- [ ] skip-link يعمل (`AppShell.vue:62` `common.skipToContent`)
- [ ] ترتيب Tab: header → main → nav، لا فخاخ تركيز
- [ ] كل زر له `aria-label` عربي ويحقق 44px (`tokens.ts:65` `tapTargetMin`)
- [ ] تباين النصوص ≥4.5:1
- [ ] `aria-live="polite"` للـ toasts (`AppToaster.vue:12`)

## i18n

- [ ] لا نصوص عربية/إنكليزية مُكتوبة يدوياً خارج `ar.json` (باستثناء `router/index.ts` titles → دين تقني موثق)
- [ ] `common.skipToContent` مستخدم

## Coverage

- [ ] `pnpm test:coverage` يمر بـ `services/composables/utils` ≥80 خطوط (انظر `vitest.config.ts:17-29`)

## E2E (playwright)

- [ ] `auth-onboarding` ✅
- [ ] `daily-entry-offline` sale+purchase+notes + reload + ⏳→✅
- [ ] `supplier-invoice` happy+offline+overpay+delete guard
- [ ] `obligation-pay` add → pending → mark paid → مدفوعة (جديد M7)
- [ ] `subscription-lock` expired/grace/active
- [ ] `renewal` Whish/OMT 20$ + cta-whatsapp/mail (جديد M7)
- [ ] `sync-offline` (إن وجد)

## PWA

- [ ] manifest icons 192/512 (`vite.config.ts:29`)
- [ ] SW `NetworkOnly + BackgroundSyncPlugin` (`sw.ts:41-53`)
- [ ] Lighthouse PWA ≥90 + a11y ≥90 (mobile) — انظر `docs/checklists/lighthouse.md`

## Sync

- [ ] 23505 obligationPayment → silent reconcile + `console.warn` (`flush.ts:55-76`, `flush.test.ts`)
- [ ] crash-safe queue: enqueue → reload → `pendingCount` محفوظ (تجربة يدوية)

## تشغيل (Runbook)

- [ ] `docs/runbook-subscription.md` مراجع من المؤسس + تجربة flip تجريبية
- [ ] قالب intake منسوخ إلى Notion/Sheet وجاهز لدعوة 10–20 تاجر

## بعد الانتهاء

- افتح Bug-bash 1–2 أسبوع، صنّف P0/P1/P2، ثم أرسل إصلاحات.
