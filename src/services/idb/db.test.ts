import { beforeEach, describe, expect, it } from 'vitest';

import { db } from './db';
import { createRepository } from './repository';

import type { Sale } from '@/types/domain';

function makeSale(id: string, date = '2026-08-21', overrides: Partial<Sale> = {}): Sale {
  return {
    id,
    createdAt: '2026-08-21T10:00:00.000Z',
    updatedAt: '2026-08-21T10:00:00.000Z',
    date,
    cashUsdCents: 1000,
    cashLocalCents: 500_000,
    exchangeRate: 89_500,
    totalUsdCents: 1559,
    ...overrides,
  };
}

describe('createRepository (Dexie CRUD)', () => {
  const repo = createRepository(db.sale);

  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('put + get round-trips a row by UUID id', async () => {
    const row = makeSale('a1');
    await repo.put(row);
    expect(await repo.get('a1')).toEqual(row);
    expect(await repo.get('missing')).toBeUndefined();
  });

  it('getAll returns every stored row', async () => {
    await repo.bulkPut([makeSale('a'), makeSale('b', '2026-08-20')]);
    expect((await repo.getAll()).length).toBe(2);
    expect(await repo.count()).toBe(2);
  });

  it('where filters on an indexed field', async () => {
    await repo.bulkPut([makeSale('a', '2026-08-20'), makeSale('b', '2026-08-21')]);
    const rows = await repo.where('date', '2026-08-21');
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  it('where throws when the field is not indexed', async () => {
    await expect(repo.where('cashUsdCents', 1000)).rejects.toThrow(/not indexed/);
  });

  it('bulkPut upserts by id and remove deletes', async () => {
    await repo.put(makeSale('a'));
    await repo.bulkPut([makeSale('a', '2026-08-21', { totalUsdCents: 9999 }), makeSale('new')]);
    expect((await repo.get('a'))?.totalUsdCents).toBe(9999);
    await repo.remove('new');
    expect(await repo.count()).toBe(1);
  });

  it('clear empties the table', async () => {
    await repo.put(makeSale('a'));
    await repo.clear();
    expect(await repo.count()).toBe(0);
  });
});
