# قائمة تحقق Lighthouse — يدوية قبل البيتا (M7)

> قرار M7: فحص يدوي، ليس CI فاشل (lighthouseci → M8). الهدف: **≥90** لـ PWA و Accessibility على لوحة التحكم.

## البيئة

- بناء معاينة Vercel: `https://smart-trader-assistant.vercel.app` (مجاني، `vite.config.ts:17-30` manifest).
- متصفح Chrome بنافذة خفية، throttling افتراضي Lighthouse.
- اختبر `/` و `/sales` و `/subscription` (الـ shell + أهم مسار + شاشة التجديد).

## الخطوات

1. `pnpm build && pnpm preview --port 4173 --strictPort` أو افتح رابط المعاينة.
2. DevTools → Lighthouse → Mode **Navigation**, Device **Mobile** (ثم Desktop للتحقق).
3. اختر فئات **PWA + Accessibility + Best Practices** (Performance اختياري).
4. شغّل → صدّر JSON/HTML وأرفقه في PR.

## معايير القبول

- PWA ≥90
- Accessibility ≥90
- Best Practices ≥90
- لا فشل في `manifest` (icons 192/512, `theme_color #0f766e`, `background_color #f8fafc`, `display standalone`, `start_url /`, `lang ar`, `dir rtl`) — راجع `vite.config.ts:17-32`.
- SW `src/pwa/sw.ts:41-53` يستخدم `NetworkOnly + BackgroundSyncPlugin` لـ `/rest/v1/` (لا `CacheFirst`).

## الأعطال الشائعة وحلولها

| فشل                          | حل                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Manifest: missing 512 icon` | أضف 512 maskable → `vite.config.ts`                                                                                                     |
| `PWA: not installable`       | تأكد `start_url` و `scope /`                                                                                                            |
| `Accessibility: contrast`    | `text-muted #64748b` على `bg #f8fafc` قد يفشل على نص صغير → بدّل إلى `text #0f172a`                                                     |
| `Tap targets too small`      | تحقق `min-block-size var(--tap-target-min)=44px` في `AppShell.vue`, `SalesView.vue`, `ObligationsView.vue:425`, `InventoryView.vue:274` |

## توثيق النتيجة

انسخ هذا القالب إلى وصف PR:

```
Lighthouse (mobile, navigation):
- / — PWA __ / a11y __ / BP __
- /sales — PWA __ / a11y __ / BP __
- /subscription — PWA __ / a11y __ / BP __
ملاحظات: __
```
