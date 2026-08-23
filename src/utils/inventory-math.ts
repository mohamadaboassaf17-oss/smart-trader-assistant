import { err, ok, type Result } from '@/types/result';

import type { InventoryMoveDirection, Product } from '@/types/domain';

/** Typed failure modes of `applyInventoryMove`; UI maps each to a locale key. */
export type InventoryMoveError =
  | { kind: 'nonPositiveQty' }
  | { kind: 'nonIntegerQty' }
  | { kind: 'insufficientShelf' }
  | { kind: 'insufficientWarehouse' };

/**
 * Apply a shelf↔warehouse quantity move to a product, returning a NEW
 * product row (the input object is never mutated).
 *
 * Guards run in order: non-integers first (fractional or non-finite input),
 * then non-positive quantities, then availability — moving more than the
 * source stock is rejected without producing a partial state. Identity and
 * audit fields (`id`, `createdAt`, `updatedAt`, `userId`, `name`) are
 * carried over unchanged.
 */
export function applyInventoryMove(
  product: Product,
  direction: InventoryMoveDirection,
  quantity: number,
): Result<Product, InventoryMoveError> {
  if (!Number.isInteger(quantity)) return err({ kind: 'nonIntegerQty' });
  if (quantity <= 0) return err({ kind: 'nonPositiveQty' });

  switch (direction) {
    case 'shelfToWarehouse':
      if (quantity > product.shelfQty) return err({ kind: 'insufficientShelf' });
      return ok({
        ...product,
        shelfQty: product.shelfQty - quantity,
        warehouseQty: product.warehouseQty + quantity,
      });
    case 'warehouseToShelf':
      if (quantity > product.warehouseQty) return err({ kind: 'insufficientWarehouse' });
      return ok({
        ...product,
        shelfQty: product.shelfQty + quantity,
        warehouseQty: product.warehouseQty - quantity,
      });
  }
}
