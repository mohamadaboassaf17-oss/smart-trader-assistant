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

- [ ] Supabase migration: `supplier` table (`id`, `user_id`, `name`, `phone`, `balance_usd_cents` (derived/computed), `created_at`, `updated_at`)
- [ ] Supplier list, create, edit, delete; Arabic phone validation
- [ ] Supabase migration: `goods_invoice` table (`id`, `user_id`, `supplier_id`, `date`, `total_usd_cents`, `paid_cash_usd_cents`, `debt_usd_cents` (computed), `note`)
- [ ] Invoice entry: total + cash paid → auto-compute debt and bump supplier balance
- [ ] Supabase migration: `product` table (`id`, `user_id`, `name`, `shelf_qty`, `warehouse_qty`, `created_at`, `updated_at`)
- [ ] Inventory list with shelf/warehouse columns
- [ ] Manual move dialog: shelf ↔ warehouse with optional quantity change / new product
- [ ] Suppliers dashboard tab: list with outstanding balance, drill into invoice history
- [ ] Vitest: invoice math (paid + debt == total), balance aggregation
- [ ] E2E: add supplier → create invoice → verify balance update

## M6 — Obligations, Dashboard & Subscription Paywall

- [ ] Supabase migration: `obligation` table (`id`, `user_id`, `name`, `amount_usd_cents`, `due_day` (1-31), `active`, `created_at`, `updated_at`)
- [ ] Supabase migration: `obligation_payment` table (`id`, `user_id`, `obligation_id`, `month` (YYYY-MM), `status` (enum: pending|paid), `paid_at`)
- [ ] At month start, generate pending `obligation_payment` rows for active obligations
- [ ] Obligation list grouped by month; "تأكيد الدفع" action → mark paid (affects net)
- [ ] Dashboard view: gross (sum of `sale.total_usd_cents` for period), net formula per PRD §6.6
- [ ] Goal progress sourced from net total
- [ ] Subscription renewal screen (PRD §4.4) with Whish Money / OMT copy + WhatsApp/email CTA
- [ ] On every sync, check `subscription_expires_at`; if expired, lock UI; allow local reads/writes until next online check
- [ ] Grace period banner when within 2 days of expiry (configurable)
- [ ] Vitest: net formula across mixed-currency days, month-rollover edge cases
- [ ] E2E: simulate expiry → confirm UI locks on next online check

## M7 — Beta Hardening

- [ ] Thumb-zone audit: ensure sale/side-purchase CTAs sit in lower 1/3 of viewport on common phone heights
- [ ] Time-to-input measurement: log end-of-day entry duration; target <3 min on a real device
- [ ] Accessibility pass: focus order, ARIA labels (Arabic), contrast, large-tap targets (≥44px)
- [ ] Lighthouse PWA + a11y score ≥ 90 on dashboard
- [ ] i18n audit: remove all hardcoded strings, ensure `ar.json` coverage
- [ ] Vitest coverage report ≥ 80% on `services/`, `composables/`, `utils/`
- [ ] Playwright E2E suite covering: auth, daily entry, supplier invoice, obligation pay, subscription renewal, offline → online sync
- [ ] Error toasts in Arabic; structured `console.error` context for all caught errors
- [ ] Crash-safe sync queue: never lose a queued op on reload
- [ ] Roll out to 10–20 beta merchants (LB + SY); collect feedback via simple Notion/Sheet form
- [ ] Bug-bash window (1–2 weeks) → triage → ship fixes
- [ ] Document runbook for the founder to manually flip `subscription_expires_at` from Supabase

## M8 — Phase 2: Stripe & Custom Domain _(post-Beta)_

- [ ] Purchase custom domain; wire to Vercel
- [ ] Stripe account setup; product + price for $20/mo
- [ ] Supabase Edge Function: Stripe webhook → update `subscription_status` and `subscription_expires_at`
- [ ] Stripe Checkout flow on the renewal screen
- [ ] Customer Portal for cancel / update card
- [ ] Webhook signature verification; idempotency on `subscription_*` updates
- [ ] Reconcile any manual Whish/OMT renewals (founder tool) with Stripe
- [ ] Marketing landing page + onboarding funnel
- [ ] Sunset manual-payment UI once Stripe conversion is stable

## M9 — Phase 3: OCR & New Markets _(future)_

- [ ] Camera capture component for paper receipts
- [ ] OCR pipeline (server-side or edge) → structured `side_purchase` draft
- [ ] Editable OCR result before save; user confirms totals
- [ ] Evaluate: Iraq (IQD), Libya (LYD), Egypt (EGP) — currency, locale, exchange-rate sources
- [ ] Country pack: localized currency symbol, formatting rules, onboarding copy
- [ ] Pilot with 3–5 merchants per new market before broad launch
