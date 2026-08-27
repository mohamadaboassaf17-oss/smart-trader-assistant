/**
 * useObligations — obligations feature state (M6).
 *
 * Module-scope singleton (same discipline as `useSuppliers` /
 * `useOfflineSync`): every consumer shares one set of lists. Reads are
 * local-first straight from Dexie; EVERY mutation rides the standard
 * optimistic sync-queue path through `useOfflineSync().save()/remove()` —
 * this composable never touches Dexie for writes.
 *
 * Monthly generation: `ensurePendingRows()` materializes one `pending`
 * payment row per ACTIVE obligation for the current month. Identity
 * (UUID v4 + timestamps) is assigned here because the drafts returned by
 * `pendingPaymentsForMonth` deliberately carry none. An existence check
 * precedes each insert, so repeated calls are idempotent; the server-side
 * UNIQUE constraint `(user_id, obligation_id, month)` is the backstop.
 *
 * Validation failures return typed i18n keys (`obligations.*`) so views
 * translate them without string sniffing; persistence failures log
 * structured context and surface as `unknown`.
 */
import { v4 as uuidv4 } from 'uuid';
import { ref, type Ref } from 'vue';

import { useOfflineSync } from '@/composables/useOfflineSync';
import { db } from '@/services/idb/db';
import { err, ok, tryAsync, type Result } from '@/types/result';
import { currentMonthKey, pendingPaymentsForMonth } from '@/utils/obligation-schedule';

import type { Obligation, ObligationPayment } from '@/types/domain';

/** i18n message keys this feature returns; `unknown` maps to `common.error`. */
export type ObligationErrorKey =
  | 'obligations.invalidName'
  | 'obligations.invalidAmount'
  | 'obligations.invalidDueDay'
  | 'unknown';

/** Write-shape for an obligation (identity fields are owned here). */
export interface ObligationInput {
  name: string;
  /** Monthly amount, in USD cents. */
  amountUsdCents: number;
  /** Day of month the obligation is due, 1–31. */
  dueDay: number;
  active: boolean;
}

/** Due-day asc, then Arabic-aware name asc. */
function compareObligations(a: Obligation, b: Obligation): number {
  return a.dueDay - b.dueDay || a.name.localeCompare(b.name);
}

/** Newest month first, then newest entry. */
function comparePayments(a: ObligationPayment, b: ObligationPayment): number {
  return b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt);
}

// ── Singleton state ─────────────────────────────────────────────────────────
const obligations = ref<Obligation[]>([]);
const activeObligations = ref<Obligation[]>([]);
const inactiveObligations = ref<Obligation[]>([]);
const payments = ref<ObligationPayment[]>([]);
const loading = ref(false);

/** Read both stores and rebuild the split lists. */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const obRes = await tryAsync(() => db.obligation.toArray());
    if (!obRes.ok) {
      console.error('[obligations] obligation query failed', { message: obRes.error.message });
      return;
    }
    const payRes = await tryAsync(() => db.obligationPayment.toArray());
    if (!payRes.ok) {
      console.error('[obligations] payment query failed', { message: payRes.error.message });
      return;
    }
    const sorted = [...obRes.value].sort(compareObligations);
    obligations.value = sorted;
    activeObligations.value = sorted.filter((row) => row.active);
    inactiveObligations.value = sorted.filter((row) => !row.active);
    payments.value = [...payRes.value].sort(comparePayments);
  } finally {
    loading.value = false;
  }
}

/**
 * Materialize `pending` payment rows for every ACTIVE obligation missing one
 * this month. Idempotent by construction (existence checked before insert),
 * so the second call adds nothing. Read failures abort logged-and-early —
 * the next invocation retries. Individual save failures are logged and the
 * loop continues so one bad row cannot block the rest; the gap self-heals on
 * the next call.
 */
async function ensurePendingRows(): Promise<void> {
  const month = currentMonthKey();

  const obRes = await tryAsync(() => db.obligation.toArray());
  if (!obRes.ok) {
    console.error('[obligations] generation aborted: obligation query failed', {
      message: obRes.error.message,
    });
    return;
  }
  const payRes = await tryAsync(() => db.obligationPayment.where('month').equals(month).toArray());
  if (!payRes.ok) {
    console.error('[obligations] generation aborted: payment query failed', {
      month,
      message: payRes.error.message,
    });
    return;
  }

  const existing = new Set(payRes.value.map((row) => row.obligationId));
  const sync = useOfflineSync();
  for (const draft of pendingPaymentsForMonth(obRes.value, month)) {
    if (existing.has(draft.obligationId)) continue;
    const nowIso = new Date().toISOString();
    // userId stays undefined until auth lands — mirrors useSuppliers.
    const row: ObligationPayment = {
      id: uuidv4(),
      createdAt: nowIso,
      updatedAt: nowIso,
      obligationId: draft.obligationId,
      month: draft.month,
      status: 'pending',
    };
    const result = await sync.save('obligationPayment', row);
    if (!result.ok) {
      console.error('[obligations] pending-row save failed', {
        obligationId: draft.obligationId,
        month,
        message: result.error.message,
      });
    }
  }
}

async function saveObligation(
  input: ObligationInput,
  existing?: Obligation,
): Promise<Result<void, ObligationErrorKey>> {
  const name = input.name.trim();
  if (name === '') return err('obligations.invalidName');
  if (!Number.isInteger(input.amountUsdCents) || input.amountUsdCents <= 0)
    return err('obligations.invalidAmount');
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)
    return err('obligations.invalidDueDay');

  const nowIso = new Date().toISOString();
  const row: Obligation = existing
    ? {
        ...existing,
        name,
        amountUsdCents: input.amountUsdCents,
        dueDay: input.dueDay,
        active: input.active,
        updatedAt: nowIso,
      }
    : {
        id: uuidv4(),
        createdAt: nowIso,
        updatedAt: nowIso,
        name,
        amountUsdCents: input.amountUsdCents,
        dueDay: input.dueDay,
        active: input.active,
      };

  const result = await useOfflineSync().save('obligation', row);
  if (!result.ok) {
    console.error('[obligations] save failed', { id: row.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

/**
 * Delete an obligation AND all of its payment rows. Dependents are removed
 * FIRST: the local cleanup mirrors the server-side FK cascade, and removing
 * children before the parent keeps the sync queue free of orphaned payment
 * ops racing the parent's tombstone across devices.
 */
async function removeObligation(row: Obligation): Promise<Result<void, ObligationErrorKey>> {
  const childRes = await tryAsync(() =>
    db.obligationPayment.where('obligationId').equals(row.id).toArray(),
  );
  if (!childRes.ok) {
    console.error('[obligations] payment lookup failed', {
      id: row.id,
      message: childRes.error.message,
    });
    return err('unknown');
  }

  const sync = useOfflineSync();
  for (const child of childRes.value) {
    const result = await sync.remove('obligationPayment', child);
    if (!result.ok) {
      console.error('[obligations] payment remove failed', {
        id: child.id,
        message: result.error.message,
      });
      return err('unknown');
    }
  }

  const result = await sync.remove('obligation', row);
  if (!result.ok) {
    console.error('[obligations] remove failed', { id: row.id, message: result.error.message });
    return err('unknown');
  }
  await load();
  return ok(undefined);
}

/**
 * Stamp a payment row `paid`. Re-reads the stored row by
 * (obligationId, month); when it is MISSING (deleted between render and
 * tap, or a never-persisted snapshot) the passed row becomes the base so
 * marking paid still materializes it — the defensive path.
 */
async function markPaid(payment: ObligationPayment): Promise<Result<void, Error>> {
  const lookup = await tryAsync(() =>
    db.obligationPayment
      .where('obligationId')
      .equals(payment.obligationId)
      .and((row) => row.month === payment.month)
      .first(),
  );
  if (!lookup.ok) {
    console.error('[obligations] payment lookup failed', {
      obligationId: payment.obligationId,
      month: payment.month,
      message: lookup.error.message,
    });
    return err(lookup.error);
  }

  const source = lookup.value ?? payment;
  const nowIso = new Date().toISOString();
  const paid: ObligationPayment = {
    ...source,
    status: 'paid',
    paidAt: nowIso,
    updatedAt: nowIso,
  };

  const result = await useOfflineSync().save('obligationPayment', paid);
  if (!result.ok) {
    console.error('[obligations] mark-paid save failed', {
      id: paid.id,
      message: result.error.message,
    });
    return err(result.error);
  }
  await load();
  return ok(undefined);
}

// ── Shared API ──────────────────────────────────────────────────────────────

/** Public surface shared by every `useObligations()` caller. */
export interface ObligationsApi {
  /** All obligations — due-day asc, then name asc. */
  obligations: Ref<Obligation[]>;
  activeObligations: Ref<Obligation[]>;
  inactiveObligations: Ref<Obligation[]>;
  /** All payment rows — newest month first, then newest entry. */
  payments: Ref<ObligationPayment[]>;
  loading: Ref<boolean>;
  /** Re-read both stores and rebuild the lists. */
  refresh(): Promise<void>;
  /** One `pending` payment row per active obligation for the current month. */
  ensurePendingRows(): Promise<void>;
  saveObligation(
    input: ObligationInput,
    existing?: Obligation,
  ): Promise<Result<void, ObligationErrorKey>>;
  removeObligation(row: Obligation): Promise<Result<void, ObligationErrorKey>>;
  markPaid(payment: ObligationPayment): Promise<Result<void, Error>>;
}

const api: ObligationsApi = {
  obligations,
  activeObligations,
  inactiveObligations,
  payments,
  loading,
  refresh: load,
  ensurePendingRows,
  saveObligation,
  removeObligation,
  markPaid,
};

let initialized = false;

/** Lazy-load on first access; every caller shares the same state. */
export function useObligations(): ObligationsApi {
  if (!initialized) {
    initialized = true;
    void load();
  }
  return api;
}
