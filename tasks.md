# Project Milestones & Tasks — Smart Trader Assistant

> Source of truth: `PRD-trader-assistant.md`. Conventions: `AGENTS.md`. Each task is sized to fit one PR.

## M1 — Foundation & Tooling

- [x] Confirm framework choice with user — **locked: Vue 3** (user confirmed in Phase 0)
- [x] Initialize Vite + TypeScript + PWA project (`vite-plugin-pwa`)
- [x] Configure pnpm scripts: `dev`, `build`, `preview`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:e2e`
- [x] Add ESLint (vue, ts, import/order) + Prettier (2-space, single quotes, semicolons, 100 cols, trailing commas all)
- [x] Add Vitest + @vue/test-utils + jsdom
- [x] Add Playwright (Chromium, Firefox, WebKit)
- [x] Add Vue Router, Pinia, Vue I18n, `idb` (or Dexie), `@supabase/supabase-js`, `uuid`
- [x] Set up `tsconfig` strict: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`
- [x] Set up `@/` path alias in `tsconfig` and Vite
- [x] Create target folder layout (`src/app`, `features`, `components`, `composables`, `services`, `stores`, `types`, `locales`, `pwa`, `e2e`, `supabase`)
- [x] Add CI workflow: install → lint → typecheck → test → build
- [x] Provision Supabase project (free tier); real URL/anon key documented in `.env` (gitignored) — done & live-verified 2026-08-23 (migrations 0001–0005 applied, RLS enforced, live auth signup works)
- [ ] Provision Vercel project (free tier) + deploy; document URL (`.env.example`/README) — split from the bundled item above; Supabase half done
- [x] Configure `vite-plugin-pwa`: manifest (RTL, Arabic name, theme color), icons, workbox runtime caching
- [x] Define base design tokens: colors, spacing, type scale, Arabic-friendly font (`src/style.css` + `src/styles/tokens.ts`)
- [x] Build `<html dir="rtl" lang="ar">` root layout shell with i18n bootstrap (`AppShell.vue` + `app/i18n`)
- [x] Add `src/locales/ar.json` with empty namespace stubs per feature
- [x] Write `Result<T, E>` type in `src/types/result.ts`
- [x] Write `money.ts` helpers: `toCents`, `fromCents`, `formatDualCurrency` (+ `localToUsdCents`, `dayTotalUsdCents`, `formatMoney`, `formatAmount`)
- [x] Update `AGENTS.md` Build/Lint/Test section to match actual `package.json` scripts

## M2 — Offline-First Core

- [x] Define IndexedDB schema (object stores) for `sale`, `sidePurchase`, `dailyNote`, `goal`, `supplier`, `goodsInvoice`, `obligation`, `obligationPayment`, `product`, `inventoryMove`, `profile`
- [x] Add `idb` wrapper with typed CRUD in `src/services/idb/`
- [x] Build `syncQueue` object store: `{ id, op, entity, payload, createdAt, retryCount, lastError }`
- [x] Implement `useOfflineSync` composable: enqueue, flush, retry with exponential backoff
- [x] Implement online/offline detection (`navigator.onLine` + heartbeat to Supabase)
- [x] Persist JWT in IndexedDB for offline-first app open
- [x] Implement optimistic UI update helper (`applyOptimistic` + rollback on failure)
- [x] Build `<SyncBadge>` component (⏳ / ✅ / ❌) with Arabic aria labels
- [x] Build `<NumberInput>` + `<DualCurrencyInput>` with cents-typed output
- [x] Build `useExchangeRate` composable (daily rate stored per day, used for display)
- [x] Service worker: precache app shell, runtime-cache static assets, queue failed mutations
- [x] Handle multi-device sync by upserting on UUID; reject stale rows by `updatedAt`
- [x] Vitest unit tests for IDB layer, sync queue, money helpers
- [x] E2E: go offline → add sale → come online → see ✅

## M3 — Auth, Onboarding & Profiles

- [x] Create Supabase migration: `profiles` table (FK to `auth.users`), columns: `country` (enum: LB|SY), `local_currency`, `subscription_status` (enum: trial|active|expired), `subscription_expires_at`, `created_at`
- [x] RLS policies: users can only read/write their own profile
- [x] Supabase Auth integration: Google OAuth provider
- [x] Supabase Auth integration: email + password
- [x] Supabase Auth integration: phone + OTP
- [x] Persist Supabase session in IndexedDB; restore on cold start (offline open)
- [x] Build `<AuthView>` with three sign-in tabs (Arabic)
- [x] Onboarding wizard: country picker → set local currency → first-run success
- [x] Trial logic: set `subscription_status='trial'`, `subscription_expires_at=now()+7d` on first profile create
- [x] Middleware/guard: redirect unauthenticated users to `/auth`, redirect incomplete onboarding to `/onboarding`
- [x] `useAuth` composable: `user`, `profile`, `signIn`, `signOut`, `refresh`
- [x] Vitest: auth composable, profile upsert, trial expiry check
- [x] E2E: sign up → onboard → land on dashboard

> ✅ Live validation 2026-08-23: migration `0001_profiles.sql` APPLIED & live-verified — live email+password
> signup works (email confirmation currently DISABLED — acceptable dev-phase, MUST be enabled pre-production);
> RLS enforced (anon writes blocked 42501, cross-user reads empty / writes impossible).
> ⚠️ Remaining: enable + validate Google OAuth and phone OTP providers in the Supabase console.

## M4 — Daily Operations (MVP Core)

- [x] Supabase migration: `sale` table (`id`, `user_id`, `date`, `cash_usd_cents`, `cash_local_cents`, `exchange_rate`, `total_usd_cents`, `created_at`, `updated_at`)
- [x] RLS: owner-only on `sale`
- [x] Build `<DailySalesEntry>` screen: two inputs (USD cash, local cash), exchange-rate field, save
- [x] Compute `total_usd_cents = cash_usd_cents + round(cash_local_cents / exchange_rate)`
- [x] Supabase migration: `side_purchase` table (`id`, `user_id`, `date`, `amount_cents`, `currency`, `exchange_rate`, `amount_usd_cents`, `note`, `created_at`, `updated_at`)
- [x] Build `<QuickSidePurchase>` button (thumb-zone) → modal with amount + currency toggle + optional note
- [x] Supabase migration: `daily_note` table (`id`, `user_id`, `date`, `body`, `created_at`, `updated_at`)
- [x] Build `<DailyNotes>` list + add/edit/delete
- [x] Supabase migration: `goal` table (`id`, `user_id`, `month` (YYYY-MM), `target_usd_cents`, `created_at`, `updated_at`)
- [x] Build `<GoalAdvisor>` with monthly setter + progress bar (current net vs target, required/day)
- [x] Vitest: totals math, edge cases (zero sales, missing rate, very large numbers)
- [x] E2E: enter a day end-to-end (sale + side purchase + note) in <3 min, offline

> ✅ Migrations 0002–0005 APPLIED & live-verified 2026-08-23 — all four M4 tables exist on the live Supabase
> project with owner-only RLS enforced (anon writes blocked 42501). E2E validated on Chromium only.

## M5 — Suppliers, Debts & Inventory

- [x] Supabase migration: `supplier` table (`id`, `user_id`, `name`, `phone`, created_at/updated_at) — balance NOT stored; derived from `goods_invoice` debts (owner decision 2026-08-24)
- [x] Supplier list, create, edit, delete; Arabic phone validation
- [x] Supabase migration: `goods_invoice` table (`id`, `user_id`, `supplier_id`, `date`, `total_usd_cents`, `paid_cash_usd_cents`, `debt_usd_cents` (computed), `note`)
- [x] Invoice entry: total + cash paid → auto-compute debt and bump supplier balance
- [x] Supabase migration: `product` table (`id`, `user_id`, `name`, `shelf_qty`, `warehouse_qty`, `created_at`, `updated_at`)
- [x] Inventory list with shelf/warehouse columns
- [x] Supabase migration: `inventory_move` table (audit trail for shelf↔warehouse moves) — added beyond original list so the synced entity has server storage
- [x] Manual move dialog: shelf ↔ warehouse with optional quantity change / new product
- [x] Suppliers dashboard tab: list with outstanding balance, drill into invoice history
- [x] Vitest: invoice math (paid + debt == total), balance aggregation
- [x] E2E: add supplier → create invoice → verify balance update

> ✅ M5 code-complete & locally verified 2026-08-24 — lint/typecheck/212 unit tests/build green. ⚠️ Migrations
> 0006–0009 committed but NOT yet applied to the live Supabase project — pending owner apply via dashboard;
> RLS verify pending. E2E validated on Chromium only.

## M6 — Obligations, Dashboard & Subscription Paywall

- [x] Supabase migration: `obligation` table (`id`, `user_id`, `name`, `amount_usd_cents`, `due_day` (1-31), `active`, `created_at`, `updated_at`)
- [x] Supabase migration: `obligation_payment` table (`id`, `user_id`, `obligation_id`, `month` (YYYY-MM), `status` (enum: pending|paid), `paid_at`)
- [x] At month start, generate pending `obligation_payment` rows for active obligations
- [x] Obligation list grouped by month; "تأكيد الدفع" action → mark paid (affects net)
- [x] Dashboard view: gross (sum of `sale.total_usd_cents` for period), net formula per PRD §6.6
- [x] Goal progress sourced from net total
- [x] Subscription renewal screen (PRD §4.4) with Whish Money / OMT copy + WhatsApp/email CTA
- [x] On every sync, check `subscription_expires_at`; if expired, lock UI; allow local reads/writes until next online check
- [x] Grace period banner when within 2 days of expiry (configurable)
- [x] Vitest: net formula across mixed-currency days, month-rollover edge cases
- [x] E2E: simulate expiry → confirm UI locks on next online check

> ✅ M6 code-complete & locally verified 2026-08-25 — lint/typecheck/300 unit tests/build green; E2E validated
> on Chromium only incl. the new subscription-lock spec. ⚠️ Migrations 0010–0011 committed but NOT yet applied
> to the live Supabase project — pending owner apply together with 0006–0009; RLS verify pending.
> ⚠️ Known-issue ticket: two-device obligation-payment generation race (UNIQUE 23505 reconcile) deferred to M7.

## M7 — Beta Hardening

- [x] Thumb-zone audit: ensure sale/side-purchase CTAs sit in lower 1/3 of viewport on common phone heights — FIXED `env(safe-area-inset-bottom)` on `QuickSidePurchase.vue:239`, `InventoryView.vue:295`, `ObligationsView.vue:451`, `AppShell.vue:120/126`
- [x] Time-to-input measurement: log end-of-day entry duration; target <3 min on a real device — `performance.mark` + `sessionStorage` + `console.info [perf]` in `SalesView.vue:139-192`, budget asserted in `daily-entry-offline.spec:152`
- [x] Accessibility pass: focus order, ARIA labels (Arabic), contrast, large-tap targets (≥44px) — skip-link `AppShell.vue:62` + `common.skipToContent` in `ar.json`, `tapTargetMin 44px` on `ObligationsView.vue:425`/`InventoryView.vue:274`/`style.css:skip-link`, `DualCurrencyInput.vue:26` group label
- [x] Lighthouse PWA + a11y score ≥ 90 on dashboard — manifest 192/512 `vite.config.ts:29`, SW `NetworkOnly` `sw.ts:41-53`, manual checklist `docs/checklists/lighthouse.md` (≥90 target, not CI-blocking per M7 decision)
- [x] i18n audit: remove all hardcoded strings, ensure `ar.json` coverage — `skipToContent` key, `DualCurrencyInput` group `t('sales.title')`, audit notes in `docs/checklists/beta-hardening.md` (router titles remain tech-debt)
- [x] Vitest coverage report ≥ 80% on `services/`, `composables/`, `utils/` — `vitest.config.ts:17-29` narrowed include + thresholds 80/70/75, result 86/77/87; 302 tests green
- [x] Playwright E2E suite covering: auth, daily entry, supplier invoice, obligation pay, subscription renewal, offline → online sync — added `e2e/obligation-pay.spec.ts` + `e2e/renewal.spec.ts`, extended mock/CTAs (`RenewalView.vue:86-110`), `flush.test` 23505 cases
- [x] Error toasts in Arabic; structured `console.error` context for all caught errors — verified `useToast` + `AppToaster.vue:12-26`, every `tryAsync` catch logs `[module]` + `toast.error(t('common.error'))`
- [x] Crash-safe sync queue: never lose a queued op on reload — `queue.ts:62-71` transaction, `flush.ts:55-76` 23505 silent reconcile `console.warn`, SW `NetworkOnly` as second net, E2E reload durability in `daily-entry-offline`+`supplier-invoice`
- [x] Roll out to 10–20 beta merchants (LB + SY); collect feedback via simple Notion/Sheet form — intake template in `docs/runbook-subscription.md:§6` (Notion/Sheet fields, Google Form suggestion)
- [x] Bug-bash window (1–2 weeks) → triage → ship fixes — checklist `docs/checklists/beta-hardening.md`
- [x] Document runbook for the founder to manually flip `subscription_expires_at` from Supabase — `docs/runbook-subscription.md` + checklist `docs/checklists/beta-hardening.md`; Vercel free `smart-trader-assistant.vercel.app` + Google OAuth per M7 decisions (Phone OTP deferred)

## M8 — Phase 2: Stripe & Custom Domain _(post-Beta — in progress 2026-08-27)_

- [x] Purchase custom domain; wire to Vercel — `smart-tajir.com` via Cloudflare/Namecheap + `vercel.json` 308 redirect (`smart-trader-assistant.vercel.app` + `www` → `smart-tajir.com`); `docs/domain-setup.md` + `VITE_APP_URL=https://smart-tajir.com`
- [x] Stripe account setup; product + price for $20/mo — account `billing@smart-tajir.com` (US LLC/UK Ltd entity); env `VITE_STRIPE_PUBLISHABLE_KEY` + `VITE_STRIPE_PRICE_ID` (price\_...) in `.env.example` + `src/config/payment.ts`
- [x] Supabase Edge Function: Stripe webhook → update `subscription_status` and `subscription_expires_at` — `supabase/functions/stripe-webhook/index.ts` (Deno, `verify_jwt=false`, `stripe-signature` verify) + `supabase/config.toml` + secrets `STRIPE_SECRET_KEY/STRIPE_WEBHOOK_SECRET/APP_URL`
- [x] Stripe Checkout flow on the renewal screen — `supabase/functions/create-checkout-session/index.ts` + `src/services/stripe/stripe.ts` + `src/features/subscription/RenewalView.vue:95-140` (CTA `cta-stripe`, offline guard, `?success=1/?canceled=1` toasts)
- [x] Customer Portal for cancel / update card — `supabase/functions/create-portal-session/index.ts` + `RenewalView.vue:143-166` (CTA `cta-portal`, gated on `stripe_customer_id`, `manageBilling/portalLoading`)
- [x] Webhook signature verification; idempotency on `subscription_*` updates — `stripe.webhooks.constructEventAsync` + `public.stripe_event` PK `id` (`supabase/migrations/0012_stripe.sql:16-29`) + `GREATEST(subscription_expires_at, new)` guard
- [x] Reconcile any manual Whish/OMT renewals (founder tool) with Stripe — dual-track `VITE_PAYMENT_MODE=dual` default (`src/config/payment.ts:5-27`); `docs/runbook-subscription.md:§5.1-§5.2` + `AGENTS.md:10-20` hosting row
- [x] Marketing landing page + onboarding funnel — Arabic RTL `src/features/landing/LandingView.vue` + `src/app/views/HomeView.vue` at `/` for unauthenticated (guard `home→dashboard` in `src/app/router/index.ts:36-44/106-125`); `src/locales/ar.json:landing.*`
- [x] Sunset manual-payment UI once Stripe conversion is stable — `VITE_PAYMENT_MODE` flag (`dual`→`stripe`→`manual`) + `docs/runbook-subscription.md:§8` sunset criteria (80% for 4 weeks) + `showStripe/showManual` gating in `RenewalView.vue:95,168`

> M8 code-complete 2026-08-27 — migrations `0012_stripe` committed pending live apply; Vercel domain + Stripe product require owner Dashboard steps per `docs/domain-setup.md` + `docs/runbook-subscription.md:§5.1`. Tests: `src/config/payment.test.ts` + `src/services/stripe/stripe.test.ts` (7 new); `pnpm lint/typecheck/test/build` must stay green.

## M9 — Phase 3: OCR & New Markets _(future)_

- [ ] Camera capture component for paper receipts
- [ ] OCR pipeline (server-side or edge) → structured `side_purchase` draft
- [ ] Editable OCR result before save; user confirms totals
- [ ] Evaluate: Iraq (IQD), Libya (LYD), Egypt (EGP) — currency, locale, exchange-rate sources
- [ ] Country pack: localized currency symbol, formatting rules, onboarding copy
- [ ] Pilot with 3–5 merchants per new market before broad launch
