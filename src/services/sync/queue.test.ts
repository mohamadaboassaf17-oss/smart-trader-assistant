import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/services/idb/db';

import {
  enqueueRemove,
  enqueueUpsert,
  isDeadLetter,
  listDue,
  listFailed,
  markDone,
  markFailure,
  MAX_RETRIES,
  pendingCount,
} from './queue';

import type { ObligationPayment, Product, Sale } from '@/types/domain';

// Controllable Supabase stand-in: null = offline-only build; a fake client
// exercises the queue's auth-ownership gate (configured remote ± session).
const supabaseMock = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock('@/services/supabase/client', () => ({
  getSupabase: () => supabaseMock.client,
  resetSupabase(): void {
    supabaseMock.client = null;
  },
}));

interface FakeAuthClient {
  auth: { getSession(): Promise<{ data: { session: { user: { id: string } } | null } }> };
}

/** Configure a remote whose session carries `userId`. */
function useRemoteWithSession(userId: string): void {
  const client: FakeAuthClient = {
    auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
  };
  supabaseMock.client = client;
}

/** Configure a remote that is reachable but has no session. */
function useRemoteWithoutSession(): void {
  const client: FakeAuthClient = {
    auth: { getSession: async () => ({ data: { session: null } }) },
  };
  supabaseMock.client = client;
}

function makeSale(id: string, totalUsdCents = 1000): Sale {
  return {
    id,
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    date: '2026-08-21',
    cashUsdCents: totalUsdCents,
    cashLocalCents: 0,
    exchangeRate: 89_500,
    totalUsdCents,
  };
}

function makeProduct(id: string): Product {
  return {
    id,
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    name: 'منتج تجريبي',
    shelfQty: 5,
    warehouseQty: 10,
  };
}

function makeObligationPayment(id: string): ObligationPayment {
  return {
    id,
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    obligationId: 'o1',
    month: '2026-08',
    status: 'paid',
    paidAt: '2026-08-21T10:00:00.000Z',
  };
}

describe('sync queue', () => {
  beforeEach(async () => {
    supabaseMock.client = null;
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('enqueues an upsert and reports it due immediately', async () => {
    await enqueueUpsert(makeSale('s1'), 'sale');
    expect(await pendingCount()).toBe(1);
    const due = await listDue(new Date());
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ entity: 'sale', entityId: 's1', op: 'upsert' });
    expect(due[0]?.payload).toMatchObject({ id: 's1' });
  });

  it('replaces a pending item for the same (entity, entityId)', async () => {
    await enqueueUpsert(makeSale('s1', 100), 'sale');
    await enqueueUpsert(makeSale('s1', 999), 'sale');
    expect(await pendingCount()).toBe(1);
    const [item] = await listDue(new Date());
    expect(item?.payload['totalUsdCents']).toBe(999);
  });

  it('keeps separate items for different entities/ids', async () => {
    await enqueueUpsert(makeSale('s1'), 'sale');
    await enqueueUpsert(makeProduct('p1'), 'product');
    await enqueueRemove('sale', 'gone', '2026-08-21T09:00:00.000Z');
    expect(await pendingCount()).toBe(3);
  });

  it('markFailure records error text and schedules backoff', async () => {
    const item = await enqueueUpsert(makeSale('s1'), 'sale');
    const failed = await markFailure(item, new Error('boom'), { base: 100, cap: 100, jitter: 0 });
    expect(failed.retryCount).toBe(1);
    expect(failed.lastError).toBe('boom');
    expect(Date.parse(failed.nextAttemptAt)).toBeGreaterThan(Date.now());
    // Not due yet
    expect(await listDue(new Date())).toHaveLength(0);
    expect((await listFailed()).length).toBe(1);
  });

  it('markDone removes the item', async () => {
    const item = await enqueueUpsert(makeSale('s1'), 'sale');
    await markDone(item);
    expect(await pendingCount()).toBe(0);
  });

  it('dead-letters after MAX_RETRIES', async () => {
    let item = await enqueueUpsert(makeSale('s1'), 'sale');
    for (let i = 0; i < MAX_RETRIES; i += 1) {
      item = await markFailure(item, new Error(`fail ${i}`));
    }
    expect(isDeadLetter(item)).toBe(true);
    expect(item.retryCount).toBe(MAX_RETRIES);
  });

  it('listDue returns oldest-created first', async () => {
    await enqueueUpsert(makeSale('old'), 'sale', { createdAt: '2026-08-21T10:00:00.000Z' });
    await enqueueUpsert(makeSale('new'), 'sale', { createdAt: '2026-08-21T11:00:00.000Z' });
    const due = await listDue(new Date());
    expect(due.map((d) => d.entityId)).toEqual(['old', 'new']);
  });

  it('rejects an obligationPayment without an authenticated owner', async () => {
    useRemoteWithoutSession();
    await expect(enqueueUpsert(makeObligationPayment('op1'), 'obligationPayment')).rejects.toThrow(
      /no authenticated user/,
    );
    expect(await pendingCount()).toBe(0);
  });

  it('stamps and enqueues an obligationPayment when a session owns it', async () => {
    useRemoteWithSession('u1');
    const item = await enqueueUpsert(makeObligationPayment('op2'), 'obligationPayment');
    expect(await pendingCount()).toBe(1);
    expect(item.payload['userId']).toBe('u1');
  });
});
