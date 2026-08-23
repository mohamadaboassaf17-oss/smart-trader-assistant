import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '@/services/idb/db';

import { pullChanges, pushQueue } from './flush';
import { enqueueUpsert } from './queue';

import type { SyncRemoteClient } from './remote';
import type { EntityName } from '@/types/domain';

interface FakeRemoteOptions {
  upsertError?: Error;
  fetchRows?: Record<string, unknown>[];
}

function makeFakeRemote(options: FakeRemoteOptions = {}): SyncRemoteClient & {
  calls: {
    upserts: [EntityName, Record<string, unknown>[]][];
    removed: string[];
    sincings: string[];
  };
} {
  const calls = {
    upserts: [] as [EntityName, Record<string, unknown>[]][],
    removed: [] as string[],
    sincings: [] as string[],
  };
  return {
    calls,
    async upsert(entity, rows) {
      if (options.upsertError) throw options.upsertError;
      calls.upserts.push([entity, rows]);
    },
    async remove(_entity, ids) {
      calls.removed.push(...ids);
    },
    async fetchSince(entity, sinceIso) {
      calls.sincings.push(`${entity}:${sinceIso}`);
      return options.fetchRows ?? [];
    },
  };
}

function row(id: string, updatedAt: string): Record<string, unknown> {
  return { id, createdAt: updatedAt, updatedAt };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('pushQueue', () => {
  it('pushes due items and removes them on success', async () => {
    await db.sale.bulkPut([
      {
        id: 's1',
        createdAt: 'x',
        updatedAt: 'x',
        date: '2026-08-21',
        cashUsdCents: 1,
        cashLocalCents: 0,
        exchangeRate: 1,
        totalUsdCents: 1,
      },
    ]);
    await enqueueUpsert({ id: 's1', createdAt: 'x', updatedAt: 'x' }, 'sale');

    const remote = makeFakeRemote();
    const res = await pushQueue(remote);
    expect(res).toMatchObject({ ok: true, value: { pushed: 1, failed: 0 } });
    expect(remote.calls.upserts).toHaveLength(1);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it('records failure with backoff instead of throwing', async () => {
    await enqueueUpsert({ id: 's2', createdAt: 'x', updatedAt: 'x' }, 'sale');
    const remote = makeFakeRemote({ upsertError: new Error('network down') });

    const res = await pushQueue(remote);
    expect(res).toMatchObject({ ok: true, value: { pushed: 0, failed: 1 } });
    expect(await db.syncQueue.count()).toBe(1);
    const item = (await db.syncQueue.toArray())[0];
    expect(item?.retryCount).toBe(1);
    expect(item?.lastError).toBe('network down');
  });
});

describe('pullChanges — stale rejection (newest-wins by updatedAt)', () => {
  const ENTITIES = ['sale'] as const;

  it('writes fetched rows into IndexedDB', async () => {
    const remote = makeFakeRemote({
      fetchRows: [
        {
          id: 'r1',
          createdAt: '2026-08-21T08:00:00.000Z',
          updatedAt: '2026-08-21T09:00:00.000Z',
          date: '2026-08-21',
          cashUsdCents: 500,
          cashLocalCents: 0,
          exchangeRate: 89_500,
          totalUsdCents: 500,
        },
      ],
    });
    const res = await pullChanges(remote, ENTITIES);
    expect(res).toMatchObject({ ok: true, value: { pulled: 1 } });
    expect((await db.sale.get('r1'))?.cashUsdCents).toBe(500);
  });

  it('rejects a stale remote row when local is newer', async () => {
    await db.sale.put({
      id: 'r2',
      createdAt: '2026-08-21T08:00:00.000Z',
      updatedAt: '2026-08-21T12:00:00.000Z',
      date: '2026-08-21',
      cashUsdCents: 9_999,
      cashLocalCents: 0,
      exchangeRate: 89_500,
      totalUsdCents: 9_999,
    });
    const remote = makeFakeRemote({
      fetchRows: [{ ...row('r2', '2026-08-21T09:00:00.000Z'), cashUsdCents: 1 }],
    });
    const res = await pullChanges(remote, ENTITIES);
    expect(res).toMatchObject({ ok: true, value: { pulled: 0 } });
    expect((await db.sale.get('r2'))?.cashUsdCents).toBe(9_999);
  });

  it('advances the pull cursor so rows are not re-fetched', async () => {
    const remote = makeFakeRemote({ fetchRows: [] });
    await pullChanges(remote, ['sale']);
    // First pull starts from the epoch default…
    expect(remote.calls.sincings[0]).toBe('sale:1970-01-01T00:00:00.000Z');
    // …and persists the advanced cursor.
    const stored = await db.session.get('last_pull_at:sale');
    expect(stored?.value ?? '').not.toBe('');
    await pullChanges(remote, ['sale']);
    // Second pull must resume from the stored cursor.
    expect(remote.calls.sincings[1]).toBe(`sale:${stored?.value}`);
  });

  it('tolerates a failing entity without aborting the rest', async () => {
    const failing: SyncRemoteClient = {
      ...makeFakeRemote(),
      upsert: async () => undefined,
      remove: async () => undefined,
      fetchSince: async (entity) => {
        if (entity === 'profile') throw new Error('table missing');
        return [];
      },
    };
    const res = await pullChanges(failing, ['profile', 'sale']);
    expect(res).toMatchObject({ ok: true, value: { failed: 1, pulled: 0 } });
  });
});
