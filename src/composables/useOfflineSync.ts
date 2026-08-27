/**
 * useOfflineSync — the single offline-first entry point for features.
 *
 * Module-scope singleton state so every component sees the same sync status.
 * Lifecycle: call `initOfflineSync()` once from `main.ts`; components then
 * use `useOfflineSync()` for reads and mutations.
 *
 * Flush triggers (PRD §7.1):
 *   1. immediately after a mutation is enqueued (best effort),
 *   2. browser `online` event (all pending items are rescheduled to now),
 *   3. a 10s safety-net interval while items are pending,
 *   4. manual `flush()`.
 */

import { readonly, ref } from 'vue';

import { evaluateAfterSync } from '@/composables/useSubscription';
import { getSupabase } from '@/services/supabase/client';
import { isOnline as isNetworkOnline, subscribeConnectivity } from '@/services/sync/connectivity';
import { pullChanges, pushQueue } from '@/services/sync/flush';
import { applyOptimisticPut, applyOptimisticRemove } from '@/services/sync/optimistic';
import {
  MAX_RETRIES,
  listFailed,
  pendingCount as pendingCountSvc,
  rescheduleAll,
} from '@/services/sync/queue';
import { createSupabaseRemote } from '@/services/sync/remote';

import type { EntityName, TBaseRow } from '@/types/domain';
import type { Result } from '@/types/result';

const SYNC_ENTITIES = [
  'sale',
  'sidePurchase',
  'dailyNote',
  'goal',
  'supplier',
  'goodsInvoice',
  'obligation',
  'obligationPayment',
  'product',
  'inventoryMove',
  'profile',
] as const satisfies readonly EntityName[];

const TICK_MS = 10_000;

// ── Singleton state ─────────────────────────────────────────────────────────
export const offlineSyncState = {
  /** navigator.onLine + heartbeat result. */
  online: ref(true),
  /** A flush cycle is currently running. */
  syncing: ref(false),
  /** Queue length. */
  pendingCount: ref(0),
  /** Items that failed at least once but may still retry. */
  failedCount: ref(0),
  /** Dead letters (retries exhausted) → ❌ badge. */
  deadCount: ref(0),
  lastError: ref<string | null>(null),
  lastSyncedAt: ref<string | null>(null),
};

let initialized = false;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let unsubscribeConnectivity: (() => void) | undefined;

async function refreshCounters(): Promise<void> {
  offlineSyncState.pendingCount.value = await pendingCountSvc();
  const failed = await listFailed();
  const dead = failed.filter((i) => i.retryCount >= MAX_RETRIES);
  offlineSyncState.failedCount.value = failed.length - dead.length;
  offlineSyncState.deadCount.value = dead.length;
}

/** Run one push+pull cycle against the configured Supabase project. */
export async function flushOfflineQueue(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || offlineSyncState.syncing.value) return;
  offlineSyncState.syncing.value = true;
  try {
    const remote = createSupabaseRemote(supabase);
    const pushRes = await pushQueue(remote);
    const pullRes = await pullChanges(remote, SYNC_ENTITIES);

    if (!pushRes.ok || !pullRes.ok) {
      offlineSyncState.lastError.value =
        (!pushRes.ok ? pushRes.error.message : '') || (!pullRes.ok ? pullRes.error.message : '');
    } else {
      offlineSyncState.lastError.value = null;
      const touched = pushRes.value.pushed + pullRes.value.pulled;
      if (touched > 0) offlineSyncState.lastSyncedAt.value = new Date().toISOString();
      // M6 (PRD §4.4–§4.5): pull just merged fresh rows (incl. the profile)
      // — a confirmed-ONLINE cycle is the ONLY thing allowed to flip the
      // subscription lock. Failure/offline paths never touch it.
      await evaluateAfterSync();
    }
  } finally {
    offlineSyncState.syncing.value = false;
    await refreshCounters();
  }
}

async function onMaybeOnline(): Promise<void> {
  await rescheduleAll();
  await flushOfflineQueue();
}

/** Idempotent bootstrap; call once at app start. */
export function initOfflineSync(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  offlineSyncState.online.value = isNetworkOnline();

  unsubscribeConnectivity = subscribeConnectivity((online) => {
    offlineSyncState.online.value = online;
    if (online) void onMaybeOnline();
  });

  tickTimer = setInterval(() => {
    void refreshCounters();
    if (offlineSyncState.pendingCount.value > 0 && offlineSyncState.online.value) {
      void flushOfflineQueue();
    }
  }, TICK_MS);

  void refreshCounters().then(() => {
    if (offlineSyncState.pendingCount.value > 0 && offlineSyncState.online.value) {
      void flushOfflineQueue();
    }
  });
}

/** Test/dev teardown. */
export function stopOfflineSync(): void {
  if (tickTimer !== undefined) clearInterval(tickTimer);
  tickTimer = undefined;
  unsubscribeConnectivity?.();
  unsubscribeConnectivity = undefined;
  initialized = false;
}

export interface OfflineSyncApi {
  /** `readonly()` unwraps refs — plain readonly values for templates. */
  state: {
    readonly online: boolean;
    readonly syncing: boolean;
    readonly pendingCount: number;
    readonly failedCount: number;
    readonly deadCount: number;
    readonly lastError: string | null;
    readonly lastSyncedAt: string | null;
  };
  /** Optimistic local write + queue upsert (rollback included). */
  save: <T extends TBaseRow>(entity: EntityName, row: T) => Promise<Result<void, Error>>;
  /** Optimistic local delete + queue remove (rollback included). */
  remove: (entity: EntityName, row: TBaseRow) => Promise<Result<void, Error>>;
  flush: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOfflineSync(): OfflineSyncApi {
  async function save<T extends TBaseRow>(entity: EntityName, row: T) {
    const result = await applyOptimisticPut(entity, row);
    await refreshCounters();
    if (result.ok) void flushOfflineQueue(); // best-effort immediate attempt
    return result;
  }

  async function remove(entity: EntityName, row: TBaseRow) {
    const result = await applyOptimisticRemove(entity, row);
    await refreshCounters();
    if (result.ok) void flushOfflineQueue();
    return result;
  }

  return {
    state: readonly(offlineSyncState),
    save,
    remove,
    flush: flushOfflineQueue,
    refresh: refreshCounters,
  };
}
