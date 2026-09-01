/**
 * Central Zod validation layer — P1.5 (موحّدة).
 *
 * All write-paths must call `schema.safeParse` BEFORE any
 * `db.*.put` / `enqueueUpsert`. Money is canonical USD cents,
 * `name/body` limits are display-sanitized, and bidi control
 * characters are stripped.
 */
import { z } from 'zod';

/**
 * Strip invisible bidi / isolate controls and truncate.
 * Removes U+202A..U+202E, U+2066..U+2069, U+061C, U+200E, U+200F
 * then slices to `max` and trims.
 */
export function sanitizeText(input: string, max: number): string {
  const stripped = input.replace(/[\u202A-\u202E\u2066-\u2069\u061C\u200F\u200E]/g, '');
  return stripped.slice(0, max).trim();
}

/** Canonical USD amount in cents: 0.01$ .. 90_000.00$ (≈90k$) */
export const zCents = z.number().int().min(1).max(90_000_00);

/** Exchange rate local-per-USD, finite 1 .. 500_000 */
export const zRate = z.number().finite().min(1).max(500_000);

/** Sanitized text 2..max (after stripping + slice + trim) */
export const zText = (max: number) =>
  z
    .string()
    .transform((s) => sanitizeText(s, max))
    .pipe(z.string().min(2).max(max));

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const zMonth = z.string().regex(/^\d{4}-\d{2}$/);

// ── Schemas ──────────────────────────────────────────────────────────

/** Daily sale (PRD §6.1) */
export const saleInsertSchema = z.object({
  date: zDate,
  cashUsdCents: z.number().int().min(0).max(90_000_00),
  cashLocalCents: z
    .number()
    .int()
    .min(0)
    .max(90_000_00 * 500),
  exchangeRate: zRate,
  totalUsdCents: z.number().int().min(0).max(90_000_00),
});

/** Side purchase (non-goods expense) */
export const sidePurchaseInsertSchema = z.object({
  date: zDate,
  amountCents: zCents,
  currency: z.enum(['USD', 'LBP', 'SYP', 'IQD', 'EGP', 'LYD', 'EUR', 'GBP']),
  exchangeRate: zRate,
  amountUsdCents: zCents,
  note: zText(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

/** Supplier */
export const supplierInsertSchema = z.object({
  name: zText(120),
  phone: z.string().max(20).optional(),
});

/** Goods invoice (supplier debt) */
export const goodsInvoiceInsertSchema = z.object({
  supplierId: z.string().min(1),
  date: zDate,
  totalUsdCents: zCents,
  paidCashUsdCents: z.number().int().min(0).max(90_000_00),
  debtUsdCents: z.number().int().min(0).max(90_000_00),
  note: zText(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

/** Product */
export const productInsertSchema = z.object({
  name: zText(120),
  shelfQty: z.number().int().min(0).max(1_000_000),
  warehouseQty: z.number().int().min(0).max(1_000_000),
});

/** Inventory move */
export const inventoryMoveSchema = z.object({
  productId: z.string().min(1),
  direction: z.enum(['shelfToWarehouse', 'warehouseToShelf']),
  quantity: z.number().int().min(1).max(1_000_000),
});

/** Obligation */
export const obligationInsertSchema = z.object({
  name: zText(120),
  amountUsdCents: zCents,
  dueDay: z.number().int().min(1).max(31),
  active: z.boolean(),
});

/** Daily note — body 2..2000 */
export const noteInsertSchema = z.object({
  date: zDate,
  body: zText(2000),
});

/** Monthly goal — month YYYY-MM */
export const goalInsertSchema = z.object({
  month: zMonth,
  targetUsdCents: zCents,
});

/** OCR draft (transient, M9) — rawText ≤5000, draftNote ≤60, amount via zCents */
export const ocrDraftSchema = z.object({
  status: z.enum(['pending', 'needs_review', 'failed']),
  rawText: z
    .string()
    .transform((s) => sanitizeText(s, 5000))
    .pipe(z.string().max(5000))
    .optional(),
  draftAmountCents: zCents.optional(),
  draftCurrency: z.enum(['USD', 'LBP', 'SYP', 'IQD', 'EGP', 'LYD', 'EUR', 'GBP']).optional(),
  draftNote: zText(60).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

// ── Helpers for queue validation ─────────────────────────────────────

export const entitySchemas: Record<string, z.ZodTypeAny> = {
  sale: saleInsertSchema,
  sidePurchase: sidePurchaseInsertSchema,
  supplier: supplierInsertSchema,
  goodsInvoice: goodsInvoiceInsertSchema,
  product: productInsertSchema,
  inventoryMove: inventoryMoveSchema,
  obligation: obligationInsertSchema,
  dailyNote: noteInsertSchema,
  goal: goalInsertSchema,
  ocrDraft: ocrDraftSchema,
};
