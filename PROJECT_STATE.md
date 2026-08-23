# PROJECT_STATE.md — Smart Trader Assistant

> Single Source of Truth for project status, written for AI agents starting fresh sessions.
> Snapshot generated **2026-08-23**: original audit by static inspection only (no builds/tests executed during
> that pass); **updated later the same day after a live validation pass** — addendum below supersedes stale claims.
> **Git:** repository initialized with remote `github.com/mohamadaboassaf17-oss/smart-trader-assistant`;
> tree clean. Timeline sections below still rely on filesystem timestamps and doc contents.
>
> **Live-validation addendum (2026-08-23):** Supabase project provisioned by owner; migrations 0001–0005 APPLIED
> and live-verified (all four M4 tables + `profiles` exist). Live auth signup works (email confirmation DISABLED —
> acceptable dev-phase; MUST be enabled pre-production). RLS verified enforced: anon writes blocked (42501),
> cross-user reads empty / writes impossible. `.env` holds real `VITE_SUPABASE_URL` + publishable anon key,
> properly gitignored; no service-role key in repo. **Verdict: READY-FOR-M5.**
> Remaining open: Vercel deployment + enabling email confirmation before production.

---

# 1. Project Overview

Offline-first PWA ("financial & operational smart assistant") for retail shop owners and small merchants in
**Lebanon and Syria**: end-of-day sales entry (<3 min target), emergency side purchases, supplier debt tracking,
simple notebook-style inventory, monthly obligations, financial dashboard, daily notes and a goal advisor —
fully Arabic UI (RTL) with USD/local dual-currency handling under severe exchange-rate volatility
(source: `PRD-trader-assistant.md` v1.2, June 2026).

- **Current phase:** Beta-track MVP development. **M1–M4 complete per `tasks.md`** (ticked 2026-08-23);
  Supabase LIVE — migrations 0001–0005 applied & live-verified 2026-08-23 (RLS enforced; live email signup works,
  email confirmation disabled until pre-production); E2E validated on Chromium only. **Verdict: READY-FOR-M5.**
  Remaining open: Vercel deployment. Next up: M5.
- **Target users:** shop owners (retail + social-commerce sellers) dealing daily in local currency + USD.

| Layer         | Choice                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Frontend      | Vue 3 ^3.5.34 + TypeScript ~6.0.2 + `<script setup>`                                                  |
| Build tool    | Vite ^8.0.12 + `vite-plugin-pwa` ^1.3.0 (Workbox injectManifest strategy)                             |
| Local storage | IndexedDB via **Dexie** ^4.4.3 + app-level durable sync queue                                         |
| State         | Pinia ^3.0.4 installed and registered — zero store files exist; singleton composables used instead    |
| Routing       | Vue Router ^5.1.0                                                                                     |
| i18n          | Vue I18n ^9.14.5 — single locale `ar`, RTL                                                            |
| Backend / DB  | Supabase LIVE since 2026-08-23 (migration applied, RLS enforced); client still nulls without env vars |
| Hosting       | Vercel (free tier) — deployment OUTSTANDING (sole open infra item)                                    |
| IDs           | UUID v4 (`uuid` ^14.0.0 client-side; `gen_random_uuid()` default server-side)                         |

---

# 2. Current Status

Snapshot: 4 of 9 milestones are complete (M1–M4). **Live validation passed 2026-08-23**: Supabase provisioned,
migrations 0001–0005 applied & live-verified, live auth signup works, RLS enforced. **Verdict: READY-FOR-M5.**
Sole open infra item: Vercel deployment (+ enable email confirmation pre-production). Docs synced 2026-08-23
(`tasks.md`, AGENTS.md "Project Status", this file).

| Item                                                                                                                      | Status                                                                                                        | Evidence                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tooling scaffold (Vite/Vitest/Playwright/ESLint/Prettier/pnpm scripts)                                                    | Completed                                                                                                     | package.json, root configs                                                 |
| PWA manifest + custom Workbox SW (precache, BackgroundSync queue)                                                         | Completed                                                                                                     | vite.config.ts, src/pwa/sw.ts                                              |
| Offline-first core: Dexie DB (14 stores), sync queue w/ backoff + dead letters, optimistic writes, connectivity detection | Completed                                                                                                     | src/services/idb/_, src/services/sync/_, src/composables/useOfflineSync.ts |
| Auth + Onboarding + Profiles (M3)                                                                                         | Completed; live email+password validated 2026-08-23; RLS enforced; Google OAuth / SMS OTP still unvalidated   | tasks.md M3 warning note; src/services/supabase/\*                         |
| Daily operations (M4): Sales entry, Quick side purchase, Daily notes, Goal advisor                                        | Completed & live-verified 2026-08-23; migrations 0002-0005 applied (tables + RLS verified); E2E Chromium-only | src/features/{sales,purchases,notes,goals}, supabase/migrations/0002-0005  |
| Suppliers / Inventory / Obligations UIs (M5/M6 scope)                                                                     | Planned — routed placeholder stubs only (25-line views each)                                                  | SuppliersView.vue, InventoryView.vue, ObligationsView.vue                  |
| Financial dashboard (gross/net display)                                                                                   | Planned — placeholder view; net math already exists in src/utils/goal-math.ts                                 | DashboardView.vue                                                          |
| Subscription paywall / renewal screen (M6)                                                                                | Planned — pure helpers exist (`subscriptionState`, 7-day trial), no UI lock yet                               | src/utils/subscription.ts                                                  |
| Supabase project + Vercel provisioning                                                                                    | Supabase DONE & live-verified 2026-08-23 (real `.env` present, gitignored); Vercel OPEN                       | tasks.md M1 split items; live validation pass                              |
| Git repository / CI execution                                                                                             | Repo initialized; remote configured (github.com/mohamadaboassaf17-oss/smart-trader-assistant), clean tree     | git remote -v; git status (2026-08-23)                                     |

**Rough completion estimate:** ~40% overall.
Basis: 9 milestones defined in tasks.md (M1–M9). Per tasks.md checkboxes M1–M4 done = 44%; weighting the
remaining hardening/beta/Phase-2 work, ~40% is a fair midpoint.

**Current problems / limitations:** Vercel deployment outstanding; email confirmation disabled in Supabase
(must be enabled pre-production); Google OAuth / phone OTP providers not yet enabled or validated; sync/auth
stack live-checked at basics level only (email+password signup + RLS), full conflict/multi-device flows unexercised.

---

# 3. Completed

Only genuinely done, verifiable items:

- [x] Project scaffold with pnpm scripts matching AGENTS.md exactly: dev, build, build:e2e, preview, lint,
      lint:fix, format, format:check, typecheck, test, test:watch, test:coverage, test:e2e, test:e2e:ui — package.json
- [x] Strict TS config: strict, noUncheckedIndexedAccess, noImplicitOverride, plus noUnusedLocals,
      noUnusedParameters, erasableSyntaxOnly, noFallthroughCasesInSwitch; @/\* path alias — tsconfig.app.json
- [x] ESLint flat config (vue flat/recommended + typescript-eslint recommended + import-x/order enforced with
      newlines-between and alphabetize + prettier compat) — eslint.config.js
- [x] Prettier: semicolons, single quotes, printWidth 100, trailingComma all, endOfLine lf — .prettierrc.json
- [x] CI workflow definition: format:check, lint, typecheck, unit tests, build, Playwright E2E across
      chromium/firefox/webkit on Node 24 + pnpm 11 — .github/workflows/ci.yml (never executed: no git repo)
- [x] Design tokens + Arabic-friendly base styles — src/styles/tokens.ts, src/style.css (mtimes 2026-06-13)
- [x] Result type with ok/err/tryAsync — src/types/result.ts (+ result.test.ts)
- [x] Money helpers: toCents, fromCents, formatDualCurrency, localToUsdCents, dayTotalUsdCents, formatMoney,
      formatAmount — src/utils/money.ts (+ money.test.ts)
- [x] RTL Arabic shell: html lang="ar" dir="rtl" (index.html); i18n bootstrap locking locale to ar
      (src/app/i18n/index.ts); applyDocumentLocale() called from App.vue onMounted
- [x] Locale file with 17 top-level namespaces including pre-built namespaces for unbuilt features
      (suppliers, inventory, obligations, subscription) — src/locales/ar.json
- [x] Domain model: TName/TNameInsert types for all 11 entities plus SyncQueueItem, SessionRecord,
      ExchangeRateEntry — src/types/domain.ts (239 lines)
- [x] Dexie schema v1 with 14 object stores (sale, sidePurchase, dailyNote, goal, supplier, goodsInvoice,
      obligation, obligationPayment, product, inventoryMove, profile, syncQueue, session, exchangeRates)
      — src/services/idb/db.ts (+ db.test.ts)
- [x] Sync engine: queue item { id, entityId, entity, op upsert|remove, payload, createdAt, retryCount,
      lastError, nextAttemptAt }; exponential backoff; dead-letter after MAX_RETRIES; dedupe on enqueue via
      [entity+entityId]; flush triggers = post-mutation best effort + browser online event + 10 s safety tick +
      manual — src/services/sync/{queue,backoff,flush}.ts, src/composables/useOfflineSync.ts (+ unit tests)
- [x] Optimistic put/remove helpers with rollback — src/services/sync/optimistic.ts (+ test)
- [x] Connectivity detection (navigator.onLine + heartbeat) — src/services/sync/connectivity.ts (+ test)
- [x] Pull merge newest-wins by updatedAt (stale remote rejected); snake_case/camelCase key mapping against
      singular snake_case tables (TABLE_BY_ENTITY) — src/services/sync/flush.ts, remote.ts (+ tests)
- [x] Custom service worker: precache app shell, CacheFirst images/fonts with expiration, NavigationRoute SPA
      fallback, BackgroundSyncPlugin second safety net for /rest/v1/ POSTs (7-day retention) — src/pwa/sw.ts
- [x] Shared components: NumberInput (cents-typed), DualCurrencyInput, SyncBadge (pending/saved/error states
      with Arabic aria labels), AppToaster — src/components/\* (all four have tests)
- [x] Exchange-rate store: one rate per business day keyed by date, getLatestRate reuse
      — src/services/idb/exchangeRates.ts + src/composables/useExchangeRate.ts (+ test)
- [x] Supabase auth layer: password signup/sign-in, Google OAuth, phone OTP verify/sign-in, sign-out, session
      restore persisted to IndexedDB via custom Dexie storage adapter — src/services/supabase/\*
      {auth,client,storageAdapter}.ts (+ tests). Mock/unit-tested only.
- [x] Router guards: requiresAuth/requiresOnboarding meta defaults, cold-offline ensureAuthReady() before the
      first decision, signed-in users never see /auth, Arabic document titles per route — src/app/router/index.ts
- [x] Auth screen with three sign-in tabs; onboarding wizard (country LB/SY then local currency)
      — AuthView.vue (312 lines), OnboardingView.vue (159 lines)
- [x] Trial logic: TRIAL_DAYS=7, pure subscriptionState() resolver — src/utils/subscription.ts (+ test)
- [x] Migration 0001_profiles.sql: profiles table (country enum LB|SY, local_currency, subscription_status
      enum trial|active|expired, subscription_expires_at), owner-only RLS, shared touch_updated_at() trigger
- [x] M4 SalesView (306 lines): two cash inputs + rate field, canonical formula cash_usd +
      round(cash_local/rate), day navigation, 7-day history strip, editing an existing day — src/features/sales/\*
- [x] QuickSidePurchase thumb-zone FAB + modal (amount, USD/LBP/SYP toggle, optional note) and PurchasesView
      recent list — src/features/purchases/\* (+ test)
- [x] Notes: list + composer + inline edit + two-step delete confirmation riding the sync pipeline
      — src/features/notes/\* (+ NotesView.test.ts)
- [x] Goals: monthly target setter (one row per month, upsert semantics), progress bar with net vs target and
      required-per-day; net locked as sales minus side purchases (obligations deferred to M6 per goal-math.ts
      header "locked by product owner") — src/features/goals/\*, useGoalAdvisor.ts, utils/goal-math.ts (+ tests)
- [x] Migrations 0002_sale.sql / 0003_side_purchase.sql / 0004_daily_note.sql / 0005_goal.sql: bigint cents,
      rate snapshots, owner-only RLS policies, updated_at triggers — APPLIED to live Supabase project & live-verified 2026-08-23
- [x] E2E specs: smoke (RTL/title/nav), sync-offline, auth-onboarding, daily-entry-offline (full offline day:
      sale + side purchase + note, reload durability, online flush + badge flip, wall-clock measurement) plus
      supabase-mock helper intercepting /api-mock/\*\* — e2e/
- [x] Documentation set: PRD v1.2, tasks.md, AGENTS.md, README.md

---

# 4. In Progress

Nothing is mid-edit right now (last source change: 2026-08-22 ~23:08 local time). Open work streams:

1. **Vercel deployment** — sole open infrastructure item (project not yet created/deployed).
2. **Pre-production auth hygiene** — enable email confirmation in the Supabase console (currently DISABLED;
   dev-phase acceptable only) and enable + validate Google OAuth and phone OTP providers.

Live-backend bring-up RESOLVED 2026-08-23: Supabase provisioned, migrations 0001–0005 applied & live-verified
(live email signup works; RLS enforced — anon writes blocked 42501, cross-user reads empty).

M4 closure done 2026-08-23: all 12 items verified and ticked in `tasks.md`.

---

# 5. Next Steps

Derived from tasks.md unchecked items plus gaps found in this audit.

**Critical**

1. Initialize a git repository and choose a remote — currently zero version history; CI workflow is dormant.
2. Provision Supabase project (free tier) + Vercel; fill `.env` from `.env.example` — unblocks everything below.
3. Apply supabase/migrations/0001-0005; enable Google OAuth + phone OTP providers in the Supabase console.
4. ~~Reconcile tasks.md with reality: verify then tick M4 items~~ — done 2026-08-23 (all 12 ticked + caveat).

**High** 5. Live validation of M3 auth flows (Google consent screen, SMS OTP delivery, RLS enforcement) — mock-only today. 6. Verify sync engine end-to-end against real Supabase (upsert conflicts, RLS denials surfacing as dead letters). 7. M5 suppliers & debts: supplier + goods_invoice migrations, CRUD UI replacing SuppliersView stub, invoice math
(paid + debt == total), balance aggregation.

**Medium** 8. Real DashboardView reusing goal-math/money helpers (gross + net per PRD §6.6; obligations join in M6). 9. M6 obligations: tables, month-start pending rows, paywall/renewal screen, expiry lock-on-sync check
(helpers already exist in src/utils/subscription.ts). 10. Inventory feature (product list shelf/warehouse + manual move dialog) replacing InventoryView stub.

**Low** 11. M7 hardening: thumb-zone audit, accessibility pass, Lighthouse >= 90, coverage >= 80%, i18n audit,
beta rollout operations (10-20 merchants), founder runbook for manual renewals. 12. Housekeeping: delete stray empty `nul` file at repo root; consider lazy-loading feature views in AppShell
(all 8 views are statically imported today).

---

# 6. Decisions

| Decision                                                                             | Reason                                                                                                             | Rejected alternatives                                                                                      | Expected impact                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Framework lock Vue 3 + TypeScript, script setup only                                 | User confirmed in Phase 0 (tasks.md M1 first item); AGENTS.md declares it locked                                   | React (PRD §3 allowed either); Options API (AGENTS.md forbids)                                             | Uniform SFC style; vue-tsc runs inside build                                                                   |
| Dexie over raw idb for IndexedDB                                                     | Typed Table handles, versioned schema, bulkPut — recorded in AGENTS.md stack table                                 | Raw idb wrapper (tasks.md M2 wording says "idb" — outdated phrasing; folder name services/idb kept anyway) | Less boilerplate, typed queries                                                                                |
| Offline-first: IndexedDB-first reads, optimistic writes, durable sync queue          | PRD §7.1 — weak internet in target market is the top risk                                                          | Server-first with caching                                                                                  | No loading screens; queued ops survive reloads; dead letters visible via error badge                           |
| Money stored as integer cents, USD canonical; local amount kept beside rate snapshot | Avoids float errors across LBP/SYP magnitudes; history stays stable when rates move (PRD §6.1; migration comments) | Floats; storing converted-only totals                                                                      | Exact arithmetic; assertCents guards in goal-math; BigInt deliberately avoided (safe-range documented in code) |
| UUID v4 ids everywhere                                                               | Conflict-free multi-device upserts (PRD §7.2)                                                                      | Autoincrement ids                                                                                          | Idempotent upsert onConflict 'id'; service-worker replay harmless                                              |
| Single locale ar, RTL-first                                                          | MVP audience; simpler schema (SUPPORTED_LOCALES = ['ar'])                                                          | English now (deferred per i18n module comment)                                                             | All strings via ar.json; logical CSS properties used in AppShell styles                                        |
| Supabase as sole backend (Postgres + Auth + RLS)                                     | Free tier fits the $0-cost Beta launch plan (PRD §1.1, §9)                                                         | Firebase or custom backend                                                                                 | Owner-only RLS in every migration; null-client offline-only mode until provisioned                             |
| pnpm only                                                                            | Repo standard (AGENTS.md); CI pins pnpm 11 via action-setup                                                        | npm / yarn                                                                                                 | pnpm-workspace.yaml overrides pnpm 11 deny-by-default build scripts (unrs-resolver allowlist)                  |
| Extra strictness flags beyond strict                                                 | AGENTS.md mandate encoded in tsconfig.app.json                                                                     | Looser TS settings                                                                                         | Index access forces undefined handling; fewer runtime surprises                                                |
| Manual payments (Whish Money / OMT) for Beta; Stripe deferred to Phase 2 (M8)        | Zero-cost launch; founder flips subscription_expires_at manually in Supabase (PRD §4.3-4.4)                        | Stripe checkout immediately                                                                                | Pure helpers ready today; UI lock scheduled for M6                                                             |
| Net formula locked as sales minus side purchases (obligations later)                 | Explicitly "locked by product owner" in goal-math.ts header comment                                                | Including obligations immediately                                                                          | Goal advisor shippable in M4 without obligation tables                                                         |
| E2E strategy: production build with --mode e2e + /api-mock/\*\* interception         | Service worker active and realistic routing without a live backend (.env.e2e committed placeholders)               | Dev-server E2E; live Supabase in CI                                                                        | Deterministic specs; cross-browser projects runnable                                                           |
| Session/JWT persisted in IndexedDB via custom Dexie storage adapter                  | Cold offline opens must restore auth instantly (PRD §4.2)                                                          | localStorage persistence                                                                                   | Works under offline-first rule; adapter unit-tested                                                            |

---

# 7. Changes

No git history exists — the directory has never been a repository. Only what is inferable from filesystem
mtimes and doc content is recorded below (local times, indicative):

| When (mtime)           | Change                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~2026-06-06            | Initial tooling/config scaffold: eslint.config.js, .prettierrc.json, tsconfig.node.json, pnpm-workspace.yaml, public/ assets, .vscode/extensions.json                                                                                                                                                                                                                                                        |
| 2026-06-13 PM          | M1 foundation: tokens.ts, result.ts (+ test), money.ts, i18n bootstrap, env.d.ts, four placeholder feature views, tsconfig.app/json; PRD updated to v1.2 (dated June 2026)                                                                                                                                                                                                                                   |
| 2026-08-21 evening     | Lockfile refreshed (pnpm-lock.yaml 22:11); M2 core files: backoff, connectivity, useExchangeRate, SyncBadge, currency types, AppShell, main.ts, test setup, Dexie db.ts, NumberInput/DualCurrencyInput                                                                                                                                                                                                       |
| 2026-08-22 00:00-01:17 | M2 completion (queue/flush/optimistic/remote/sw/repository) + M3 wave (0001_profiles.sql, session storage adapter, supabase client/auth, profiles service, subscription utils, router guards, AuthView, OnboardingView, useAuth, e2e sync/auth specs + mock helper); docs synced same night: AGENTS.md 00:10, README 00:20, package.json 00:06, playwright.config 00:06, vitest.config 00:20, tasks.md 01:16 |
| 2026-08-22 21:16-23:08 | M4 wave: goal-math.ts, migrations 0002-0005, Sales feature (view/day-nav/history + test), Purchases (QuickSidePurchase modal + PurchasesView), Notes (composer/item/view + test), Goals (view/bar/advisor + tests), useDayFormat, e2e daily-entry-offline.spec.ts; tasks.md NOT updated afterwards                                                                                                           |
| 2026-08-22 23:01-23:02 | Production E2E build emitted into dist/; Playwright last-run recorded "passed" (test-results/.last-run.json)                                                                                                                                                                                                                                                                                                 |

Dependency changes: none observable beyond initial install plus one lockfile refresh on 2026-08-21.
API changes: none (no deployed API). Security-relevant additions: owner-only RLS policies in all five
migrations; `.env` git-ignored while `.env.example` and `.env.e2e` are intentionally tracked exceptions.

---

# 8. Problems & Solutions

No recorded problems found in repo docs. Neither tasks.md nor README nor PRD contains a problems log, and
without git there is no fix history to mine. Two caveats exist as _recorded caveats_, not solved problems:

- tasks.md carries an explicit warning under M3: implementation is mock-based; live provider and RLS validation
  is pending the still-open provisioning task. Affected: src/services/supabase/\*, e2e/helpers/supabase-mock.ts.
  Residual impact: the whole sync/auth stack is unvalidated against reality.
- flush.ts documents that one missing/broken remote table must not abort an entire pull cycle — a deliberate
  forward-compatibility design note for migrations landing in later milestones (design decision, not incident).

---

# 9. Known Issues

| #   | Issue                                                                                                                                                                                                                               | Severity | Status                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------ |
| 1   | Not a git repository — no history, no rollback capability, CI workflow dead until init + push                                                                                                                                       | High     | Open                           |
| 2   | Stale tracking docs — fixed 2026-08-23 (tasks.md M4 ticked + caveat, AGENTS.md status updated); residual: DashboardView placeholder text still references "M2" | Medium   | Partially resolved             |
| 3   | Entire backend integration (auth providers, RLS, sync push/pull) validated only against mocks/unit fakes; zero live-project evidence                                                                                                | High     | Open (blocked on provisioning) |
| 4   | dist/ build artifacts sit in the working tree though .gitignore excludes them — cannot be untracked until a repo exists                                                                                                             | Low      | Open                           |
| 5   | Stray empty file named `nul` at repo root (Windows redirect artifact)                                                                                                                                                               | Low      | Open                           |
| 6   | AppShell statically imports all 8 feature views (no route-level code splitting)                                                                                                                                                     | Low      | Open                           |

No issue tracker exists in the repo; this table is the first consolidated list.

---

# 10. Important Files

| Path                                                | Purpose                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| PROJECT_STATE.md                                    | This file — status snapshot every agent must read before large changes                            |
| PRD-trader-assistant.md                             | Product requirements v1.2 (Arabic): features §6, offline §7, UX §8, launch plan §9                |
| tasks.md                                            | Milestone/task tracker M1-M9 (primary done/pending source)                                        |
| AGENTS.md                                           | Binding conventions: stack lock, commands, style, RTL/i18n, offline rules, money rules, git rules |
| README.md                                           | Quick start + one-paragraph architecture summary                                                  |
| package.json                                        | Scripts and dependency versions (single source of truth for toolchain)                            |
| vite.config.ts                                      | Vite + PWA plugin config (injectManifest, Arabic RTL manifest), @ alias                           |
| vitest.config.ts                                    | jsdom environment, globals, setup file, v8 coverage scopes/excludes                               |
| playwright.config.ts                                | E2E: 3 browser projects, webServer builds --mode e2e then previews on 5173                        |
| tsconfig.app.json                                   | Strictness flags + path alias                                                                     |
| eslint.config.js / .prettierrc.json                 | Lint/format law                                                                                   |
| .github/workflows/ci.yml                            | CI pipeline definition (dormant until repo exists)                                                |
| .env.example / .env.e2e                             | Env templates: real Supabase vars vs committed mock values                                        |
| index.html                                          | RTL/ar root document, theme color #0f766e                                                         |
| src/main.ts                                         | App bootstrap: Pinia, Router, I18n, initOfflineSync(), mount                                      |
| src/App.vue                                         | Root component: applies locale attrs, hosts router-view + AppToaster                              |
| src/app/router/index.ts                             | All routes + auth/onboarding guards + title sync                                                  |
| src/app/i18n/index.ts                               | Locale lock to ar, MessageSchema, applyDocumentLocale()                                           |
| src/app/layouts/AppShell.vue                        | Shell layout: header + SyncBadge, bottom nav, feature-view switch                                 |
| src/types/domain.ts                                 | Every entity type + SyncQueueItem contract                                                        |
| src/types/result.ts                                 | Result<T,E> wrapper used by all fallible paths                                                    |
| src/services/idb/db.ts                              | Dexie schema — the single IndexedDB instance                                                      |
| src/services/sync/\*                                | Queue, backoff, flush/pull engine, remote client, optimistic helpers                              |
| src/services/supabase/client.ts                     | Null-safe singleton; offline-only mode without env vars                                           |
| src/services/supabase/storageAdapter.ts             | Dexie-backed Supabase session storage                                                             |
| src/composables/useOfflineSync.ts                   | The single mutation/read entry point for features                                                 |
| src/composables/useAuth.ts                          | Auth state machine + ensureAuthReady() used by router guard                                       |
| src/utils/money.ts / goal-math.ts / subscription.ts | Canonical money, goal-net, trial-state math                                                       |
| src/locales/ar.json                                 | All user-facing strings (17 namespaces)                                                           |
| src/pwa/sw.ts                                       | Custom Workbox service worker incl. BackgroundSync safety net                                     |
| supabase/migrations/0001-0005\_\*.sql               | Schema + RLS for profiles, sale, side_purchase, daily_note, goal                                  |
| e2e/\*.spec.ts + e2e/helpers/supabase-mock.ts       | Playwright suites + GoTrue/PostgREST mock interception                                            |

---

# 11. Architecture Notes

**Data flow (offline-first).** Reads always hit IndexedDB (Dexie) first — no loading screens by design
(PRD §8). Writes take the pipeline: optimistic local put/remove (with rollback on failure) into the entity
store, then enqueue into `syncQueue`, then best-effort immediate flush. Flush drains due items oldest-first;
success deletes the item, failure records lastError and schedules exponential backoff; exhausted retries become
dead letters (error badge) while the local row is never destroyed. Pull fetches rows per entity since the last
successful pull timestamp (stored in the `session` KV store) and merges newest-wins on `updatedAt`; UUID keys
make every merge an idempotent upsert. Flush triggers: post-mutation attempt, browser online event, a 10 s
tick while items pend, and manual flush. The service worker adds a second safety net via BackgroundSyncPlugin
on `/rest/v1/` POSTs — harmless duplication because upserts are idempotent on UUID.

**Money.** Integer cents everywhere (`*_cents` columns, camelCase `*Cents` fields). USD is canonical; local
amounts are stored alongside the exchange-rate snapshot captured at entry time so later rate moves never
rewrite history. Sale total = cashUsdCents + round(cashLocalCents / exchangeRate), computed client-side and
pushed as a full-row upsert. One rate per business day lives in `exchangeRates` keyed by date; new entries
reuse the latest known rate.

**Sync targets.** TABLE_BY_ENTITY maps camelCase entities to singular snake_case Postgres tables; key casing
is converted recursively both directions. Without VITE_SUPABASE_URL/ANON_KEY the client factory returns null
and every consumer no-ops — the app stays fully usable offline-only.

**Auth & routing.** Module-scope singleton state in useAuth (no Pinia stores anywhere yet). Router guard awaits
ensureAuthReady() once so a cold offline open restores the IndexedDB session without redirect flash; meta flags
requiresAuth/requiresOnboarding default true. Routes use one AppShell component hosting feature views via
meta.featureView mapping; bottom nav is generated from showInNav routes.

**i18n/RTL.** Locale locked to 'ar'; html lang/dir set at boot and kept correct via applyDocumentLocale().
Layout uses logical CSS properties (margin-inline-start, inset-block-start, padding-block-end...).

**PWA.** injectManifest strategy with custom src/pwa/sw.ts: precache app shell (glob over js/css/html/svg/woff2),
NavigationRoute fallback to precached index.html, CacheFirst runtime cache for images/fonts, BackgroundSync
mutation queue, autoUpdate registration. Manifest: standalone, portrait, lang ar, dir rtl, theme #0f766e.

**Supabase plan.** Five migrations define profiles + the four M4 tables with owner-only RLS and updated_at
triggers; none applied yet. Subscription enforcement will read subscription_expires_at on every sync (M6).

**Folder layout — target vs actual discrepancies.**

- AGENTS.md target lists `stores/` (Pinia setup stores): actual src/stores/ contains only .gitkeep; state
  lives in composables singletons instead.
- Folder `src/services/idb/` is named for "idb" but uses Dexie internally (tasks.md wording vs reality).
- Everything else matches target: app/, features/{sales,purchases,suppliers,inventory,obligations,dashboard,
  notes,goals,auth,onboarding}, components/, composables/, services/, types/, locales/, pwa/, e2e/, supabase/.
- Feature folders suppliers/, inventory/, obligations/, dashboard/ contain placeholder stub views only.

---

# 12. Development Rules

Binding for any future AI agent:

1. Read PROJECT_STATE.md and AGENTS.md before large changes; never silently overturn a prior decision
   recorded in §6 — propose the change and get owner sign-off first.
2. Never mark a task complete without verification actually run in-session (lint/typecheck/test/build);
   docs claims alone do not count.
3. Do not delete or weaken existing functionality without an explicit, stated reason.
4. Update THIS FILE after major achievements (milestone completion, provisioning, architecture shifts) and
   keep tasks.md checkboxes in sync in the same change.
5. Stay consistent with AGENTS.md: pnpm only (never npm/yarn); conventional commits (feat:/fix:/chore:/...);
   strict TS with noUncheckedIndexedAccess — no `any`; interface for object shapes, type for unions;
   semicolons, single quotes, 100 cols, trailing commas all.
6. Imports grouped builtin > external > @/ > relative with blank lines (eslint import-x/order enforces);
   import from source files, no barrel re-exports inside features/\*.
7. User-facing strings only via src/locales/ar.json — no hardcoded Arabic/English in components; logical CSS
   properties only; mirror directional icons.
8. Error handling through Result<T,E>/tryAsync; never swallow errors; user-facing failures raise an Arabic
   toast, console.error keeps structured context.
9. Offline-first rules are inviolable: local reads first, optimistic writes, queue items keep
   {id, createdAt, retryCount, lastError}; retries must be durable in IndexedDB; never block UI on network.
10. Money stays integer cents; USD canonical; snapshot the daily rate with each transaction; never floats.
11. New DB columns/tables need: domain.ts types, Dexie store bump (version + upgrade), snake_case SQL
    migration with RLS, TABLE_BY_ENTITY entry.
12. Never commit .env, node_modules, dist/, test-results/; never print secret values.
13. Run lint + typecheck + test before any commit; CI additionally gates format:check and E2E.

---

# 13. Session History

Dates below come from filesystem mtimes (no git history exists); treat as indicative, not authoritative.

| Date (mtime)        | Accomplished                                                                                                                                     | Decisions                                                     | Problems found                          | Next task was               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------- | --------------------------- |
| ~2026-06-06         | Tooling scaffold configs                                                                                                                         | ESLint/Prettier/pnpm choices encoded                          | None recorded                           | M1 implementation           |
| 2026-06-13          | M1 foundation: tokens, Result, money utils, i18n, placeholder views; PRD bumped to v1.2                                                          | Framework already locked (Vue 3, Phase 0, exact date Unknown) | None recorded                           | M2 offline core             |
| 2026-08-21 evening  | M2 core: sync services, Dexie schema, shared inputs, SW                                                                                          | Backoff + dead-letter design; [entity+entityId] dedupe        | None recorded                           | Finish M2, start M3         |
| 2026-08-22 early AM | M2 finished + full M3: auth layer, onboarding, guards, profiles migration; docs refreshed (AGENTS.md/README/package.json/tasks.md/vitest.config) | Dexie-backed session storage; null-client offline mode        | Mock-only caveat recorded in tasks.md   | M4 daily operations         |
| 2026-08-22 evening  | Full M4: sales/purchases/notes/goals screens + tests, migrations 0002-0005, daily-entry E2E                                                      | Net formula locked to sales minus side purchases              | None recorded in docs                   | Update tasks.md (done 2026-08-23) |
| 2026-08-23          | This audit snapshot created (PROJECT_STATE.md); no source files touched                                                              | n/a                                                           | Stale-doc discrepancies catalogued (§9) | Owner decisions in §14      |
| 2026-08-23          | Docs reconciliation: M4 ticked in tasks.md (+ caveat), AGENTS.md status line updated, this file aligned                              | n/a                                                           | §9 #2 mostly closed                     | M5 suppliers & debts        |

---

# 14. Open Questions

Requiring the owner's input or further research:

1. Has a Vercel project been provisioned? No evidence either way (AGENTS.md says "to be provisioned";
   no config files reference it). Unknown.
2. Does a Supabase project exist? `.env` is absent and tasks.md says URL/anon key are needed — assume no,
   but confirm. Unknown until owner answers.
3. ~~Should M4 be marked complete in tasks.md?~~ Resolved 2026-08-23: owner confirmed M4 complete;
   all 12 items ticked (migrations 0002–0005 applied & live-verified; E2E Chromium-only).
4. Git remote choice (GitHub private?) and whether history should start fresh at init. Not yet determined.
5. Beta merchant recruitment channel (PRD mentions ready beta testers; no list/tooling exists in repo).
   Not yet determined.
6. Exact wall-clock performance of the <3-minute end-of-day entry on real devices (E2E measures it in
   automation only). Unknown pending device testing (M7).

---

# 15. Verification

This snapshot performed **zero executions**: no builds, no lint, no tests, no installs. Findings are based on
static inspection of files, configs, and artifacts present in the tree.

| Area                      | Status                                                                                                                                                                                         | Basis                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Build                     | Claimed-but-unverified now; prior success evidenced by dist/ output dated 2026-08-22 23:01 (index.html, sw.js, registerSW.js, manifest.webmanifest, asset chunks)                              | Artifacts inspected    |
| Unit tests (Vitest)       | Claimed-but-unverified now; 26 \*.test.ts files exist and CI gates them; no local run artifact                                                                                                 | File inventory         |
| E2E (Playwright)          | Prior pass evidenced: test-results/.last-run.json content {"status":"passed","failedTests":[]} written 2026-08-22 23:02, right after the daily-entry spec was authored; 4 specs + helper exist | Artifact inspected     |
| Lint / Format check       | Unverified — configs exist, no run artifact                                                                                                                                                    | Config inspection      |
| Type checking             | Claimed-but-unverified now; vue-tsc wired into build script and CI; no artifact                                                                                                                | Config inspection      |
| Runtime / Manual testing  | Unknown — no evidence of any manual device testing in repo                                                                                                                                     | Absence of records     |
| Live Supabase integration | NOT verified at all — mock-only by design (tasks.md warning)                                                                                                                                   | Docs + absence of .env |
| CI execution              | Never run — no git repository exists to trigger it                                                                                                                                             | Test-Path .git = False |

Explicit statement: everything labeled above as claimed-but-unverified reflects the state at snapshot time
(2026-08-23); re-run `pnpm lint && pnpm typecheck && pnpm test` (and optionally `pnpm test:e2e`) before
trusting green status for new work.
