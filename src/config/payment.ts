/**
 * Payment mode config (M8 Stripe & Custom Domain).
 *
 * `VITE_PAYMENT_MODE` controls which renewal UI blocks are visible:
 *   - `dual`   — Stripe + Whish/OMT (M8 default, PRD Phase 2 dual-track)
 *   - `stripe` — Stripe only (after 80% conversion for 4 consecutive weeks)
 *   - `manual` — Whish/OMT only (emergency fallback)
 *
 * Domain + Stripe publishable config are also centralized here so
 * RenewalView / checkout composables never read `import.meta.env` directly.
 */

export type PaymentMode = 'dual' | 'stripe' | 'manual';

function asPaymentMode(value: string | undefined): PaymentMode {
  if (value === 'stripe' || value === 'manual' || value === 'dual') return value;
  return 'dual';
}

export const PAYMENT_MODE: PaymentMode = asPaymentMode(
  import.meta.env.VITE_PAYMENT_MODE as string | undefined,
);

export const STRIPE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

export const STRIPE_PRICE_ID =
  (import.meta.env.VITE_STRIPE_PRICE_ID as string | undefined)?.trim() ?? '';

export const APP_URL =
  (import.meta.env.VITE_APP_URL as string | undefined)?.trim() ?? 'https://smart-tajir.com';

/** True when Stripe UI should be shown (dual or stripe). */
export const showStripe = PAYMENT_MODE === 'dual' || PAYMENT_MODE === 'stripe';

/** True when manual Whish/OMT UI should be shown (dual or manual). */
export const showManual = PAYMENT_MODE === 'dual' || PAYMENT_MODE === 'manual';

/** Whether the Stripe publishable key + price look configured (not placeholder). */
export function isStripeConfigured(): boolean {
  return (
    STRIPE_PUBLISHABLE_KEY.length > 0 &&
    !STRIPE_PUBLISHABLE_KEY.includes('your-publishable-key') &&
    STRIPE_PRICE_ID.length > 0 &&
    !STRIPE_PRICE_ID.includes('your-monthly-price-id')
  );
}
