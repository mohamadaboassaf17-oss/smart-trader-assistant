import { describe, expect, it } from 'vitest';

import { err, ok } from '@/types/result';

import { applyInventoryMove } from './inventory-math';

import type { Product } from '@/types/domain';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p-1',
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
    name: 'Sugar 1kg',
    shelfQty: 10,
    warehouseQty: 5,
    ...overrides,
  };
}

describe('applyInventoryMove', () => {
  it('moves shelf → warehouse and preserves identity fields', () => {
    const input = makeProduct();
    expect(applyInventoryMove(input, 'shelfToWarehouse', 3)).toStrictEqual(
      ok({
        id: 'p-1',
        createdAt: '2026-08-23T00:00:00Z',
        updatedAt: '2026-08-23T00:00:00Z',
        name: 'Sugar 1kg',
        shelfQty: 7,
        warehouseQty: 8,
      }),
    );
  });

  it('moves warehouse → shelf symmetrically', () => {
    expect(applyInventoryMove(makeProduct(), 'warehouseToShelf', 4)).toStrictEqual(
      ok(makeProduct({ shelfQty: 14, warehouseQty: 1 })),
    );
  });

  it('returns a new object and never mutates the input', () => {
    const input = makeProduct();
    const result = applyInventoryMove(input, 'shelfToWarehouse', 2);
    expect(result.ok && result.value).not.toBe(input);
    expect(input).toStrictEqual(makeProduct());
  });

  it('allows an exact-boundary move down to zero on either side', () => {
    expect(applyInventoryMove(makeProduct(), 'shelfToWarehouse', 10)).toStrictEqual(
      ok(makeProduct({ shelfQty: 0, warehouseQty: 15 })),
    );
    expect(applyInventoryMove(makeProduct(), 'warehouseToShelf', 5)).toStrictEqual(
      ok(makeProduct({ shelfQty: 15, warehouseQty: 0 })),
    );
  });

  it('rejects moves exceeding shelf stock without mutating the input', () => {
    const input = makeProduct({ shelfQty: 2, warehouseQty: 9 });
    expect(applyInventoryMove(input, 'shelfToWarehouse', 3)).toStrictEqual(
      err({ kind: 'insufficientShelf' }),
    );
    expect(input).toStrictEqual(makeProduct({ shelfQty: 2, warehouseQty: 9 }));
  });

  it('rejects moves exceeding warehouse stock', () => {
    expect(applyInventoryMove(makeProduct(), 'warehouseToShelf', 6)).toStrictEqual(
      err({ kind: 'insufficientWarehouse' }),
    );
  });

  it('rejects non-positive quantities', () => {
    expect(applyInventoryMove(makeProduct(), 'shelfToWarehouse', 0)).toStrictEqual(
      err({ kind: 'nonPositiveQty' }),
    );
    expect(applyInventoryMove(makeProduct(), 'warehouseToShelf', -2)).toStrictEqual(
      err({ kind: 'nonPositiveQty' }),
    );
  });

  it('rejects fractional and non-finite quantities first', () => {
    expect(applyInventoryMove(makeProduct(), 'shelfToWarehouse', 1.5)).toStrictEqual(
      err({ kind: 'nonIntegerQty' }),
    );
    expect(applyInventoryMove(makeProduct(), 'warehouseToShelf', Number.NaN)).toStrictEqual(
      err({ kind: 'nonIntegerQty' }),
    );
  });
});
