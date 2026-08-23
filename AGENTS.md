# AGENTS.md

> Repository for **Smart Trader Assistant** (مساعد ذكي للتاجر) — an offline-first PWA for shop owners in Lebanon and Syria, built per `PRD-trader-assistant.md`. This file guides agentic coding agents working in this repo.

## Project Status

**M1–M4 complete (Supabase provisioned + migrations 0001–0005 applied & live-verified 2026-08-23; only the Vercel deployment remains outstanding); next up M5.** Framework locked: **Vue 3 + TypeScript**. See `tasks.md` for milestone status.

## Tech Stack

| Layer         | Choice                                                            |
| ------------- | ----------------------------------------------------------------- |
| Frontend      | Vue 3 + TypeScript + `<script setup>`                             |
| Build tool    | Vite + `vite-plugin-pwa` (Workbox SW generated on `pnpm build`)   |
| Local storage | IndexedDB via **Dexie** (chosen over raw `idb`) + Service Workers |
| State         | Pinia (setup-syntax stores)                                       |
| Routing       | Vue Router                                                        |
| i18n          | Vue I18n (single locale `ar` for MVP; `en` later)                 |
| Backend / DB  | Supabase (PostgreSQL + Auth) — wired in M3+                       |
| Hosting       | Vercel (free tier) — project to be provisioned                    |
| IDs           | UUID v4 for all records (`uuid` package)                          |
| UI language   | Arabic, RTL — `dir="rtl"` set on `<html>`                         |

## Build / Lint / Test Commands

All commands run from the project root. `pnpm` is the only allowed package manager.

```bash
# Install
pnpm install

# Dev server
pnpm dev                       # http://localhost:5173

# Build
pnpm build                     # vue-tsc -b && vite build → dist/
pnpm build:e2e                 # same, with --mode e2e (loads .env.e2e mock URLs for Playwright)
pnpm preview                   # preview production build locally

# Lint & format
pnpm lint                      # ESLint (vue, ts, import order), --max-warnings 0
pnpm lint:fix                  # auto-fix
pnpm format                    # Prettier write
pnpm format:check              # Prettier check only
pnpm typecheck                 # vue-tsc --build --noEmit

# Tests
pnpm test                      # Vitest, full suite (single run)
pnpm test:watch                # Vitest watch mode
pnpm test:coverage             # Vitest with v8 coverage
pnpm test -- path/to/file.test.ts          # run a single test file
pnpm test -- -t "name of test"             # run a single test by name
pnpm test:e2e                  # Playwright E2E (chromium + firefox + webkit)
pnpm test:e2e:ui               # Playwright UI mode
```

On Windows shells, prefix with `CI=true` if `pnpm` prompts to confirm a modules purge (e.g. `CI=true pnpm lint`).

If you change any script in `package.json`, update this section in the same commit.

## Project Layout (target)

```
src/
  app/             # router, root layout, i18n setup
  features/        # one folder per domain: sales, purchases, suppliers, inventory, obligations, dashboard, notes, goals
  components/      # shared UI primitives
  composables/     # Vue composables (useOfflineSync, useAuth, useCurrency, etc.)
  services/        # supabase client, idb, sync queue
  stores/          # Pinia stores
  types/           # shared TS types
  locales/         # ar.json (primary), en.json
  pwa/             # service worker, manifest
e2e/               # Playwright specs
supabase/          # migrations, seed, edge functions
```

## Code Style

### Formatting

- Prettier defaults + 2-space indent, single quotes, no semis is **off** — use semicolons.
- Max line length: 100. Trailing commas: all.
- Run `pnpm format` before committing; CI fails on `format:check` drift.

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`.
- Prefer `interface` for object shapes, `type` for unions/aliases.
- No `any`. Use `unknown` + narrowing, or a precise type.
- Domain entities use UUID strings: `type Id = string` with branded types where helpful.

### Imports

- Group order, blank line between: (1) Node/built-in, (2) external packages, (3) `@/...` aliases, (4) relative. ESLint `import/order` enforces this.
- Use `@/` path alias for anything in `src/`.
- No barrel re-exports inside `features/*` — import from the source file.

### Naming

- Files: `kebab-case.ts` for utilities, `PascalCase.vue` for components, `*.test.ts` colocated.
- Components: `PascalCase` (multi-word required).
- Composables: `useXxx`.
- Stores: `useXxxStore` (Pinia setup syntax preferred).
- DB tables: snake_case, singular (`sale`, `purchase`, `supplier`).
- TS types mirroring DB rows: `TName` for row, `TNameInsert` for writes.

### Vue conventions

- `<script setup lang="ts">` always. No Options API.
- Props: `defineProps<{ ... }>()` with defaults inline; emits via `defineEmits<{ ... }>()`.
- Reactivity: prefer `ref` for primitives, `reactive` for grouped state, `computed` for derivations. No `watchEffect` when `computed` works.
- Templates: keep logic out — extract to `computed` or a composable.

### Error handling

- Never swallow errors. Use the project's `Result<T, E>` wrapper or typed `try/catch` that returns a discriminated union.
- User-facing failures show an Arabic toast; log to console with structured context.
- Service-worker / sync-queue errors must be retriable; persist retry state in IndexedDB.

### RTL & i18n

- All user-facing strings live in `src/locales/ar.json` (primary). No hardcoded Arabic/English in components.
- `dir="rtl"` on `<html>`; set via `useLocale()` composable.
- Use logical CSS properties (`margin-inline-start`, `padding-block-end`) — never `left/right` for layout.
- Icons: mirror when directional (arrows, chevrons).

### Offline-first rules

- Reads go to IndexedDB first; Supabase is the source of truth on sync.
- Writes are optimistic in the UI and enqueued in the sync queue.
- Every queue item carries `id` (UUID), `createdAt`, `retryCount`, `lastError`.
- Never block the UI on network. Show `⏳` / `✅` status per the PRD §7.1.

### Money & currency (PRD §6.1)

- USD is the canonical currency for all stored totals. Local currency is display-only.
- Every monetary value is stored as an integer in **cents** (`amount_cents: number`). Never floats.
- Exchange rate is user-entered daily; persist with each transaction's date.

### Git

- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.
- One logical change per commit. Run `pnpm lint && pnpm typecheck && pnpm test` before commit.
- Never commit `.env`, `node_modules`, or `dist/`.

## Cursor / Copilot rules

None present yet. When you add `.cursor/rules/*.mdc` or `.github/copilot-instructions.md`, **merge their content into this file in the same PR** so there is one source of truth for agent guidance.

## When you start work

1. Read `PRD-trader-assistant.md` end-to-end.
2. Confirm the framework choice (Vue 3 default) with the user.
3. Bootstrap the project, then update this file to reflect the _actual_ scripts in `package.json` — not the placeholders above.
4. If a command listed here doesn't work, fix the script and fix this file together.
