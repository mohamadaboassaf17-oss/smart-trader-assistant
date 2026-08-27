import { afterEach, describe, expect, it, vi } from 'vitest';

describe('payment config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadWithEnv(env: Record<string, string | undefined>) {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) vi.stubEnv(k, '');
      else vi.stubEnv(k, v);
    }
    // Dynamic import so stubbed env is read at module evaluation.
    const mod = await import('./payment.ts');
    return mod;
  }

  it('defaults to dual when VITE_PAYMENT_MODE is missing', async () => {
    const mod = await loadWithEnv({});
    expect(mod.PAYMENT_MODE).toBe('dual');
    expect(mod.showStripe).toBe(true);
    expect(mod.showManual).toBe(true);
  });

  it('respects stripe mode — hides manual', async () => {
    const mod = await loadWithEnv({ VITE_PAYMENT_MODE: 'stripe' });
    expect(mod.PAYMENT_MODE).toBe('stripe');
    expect(mod.showStripe).toBe(true);
    expect(mod.showManual).toBe(false);
  });

  it('respects manual mode — hides stripe', async () => {
    const mod = await loadWithEnv({ VITE_PAYMENT_MODE: 'manual' });
    expect(mod.PAYMENT_MODE).toBe('manual');
    expect(mod.showStripe).toBe(false);
    expect(mod.showManual).toBe(true);
  });

  it('falls back to dual on invalid value', async () => {
    const mod = await loadWithEnv({ VITE_PAYMENT_MODE: 'bogus' });
    expect(mod.PAYMENT_MODE).toBe('dual');
  });

  it('isStripeConfigured is false when placeholder', async () => {
    const mod = await loadWithEnv({
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_your-publishable-key',
      VITE_STRIPE_PRICE_ID: 'price_your-monthly-price-id',
    });
    expect(mod.isStripeConfigured()).toBe(false);
  });

  it('isStripeConfigured is true when real values set', async () => {
    const mod = await loadWithEnv({
      VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_123',
      VITE_STRIPE_PRICE_ID: 'price_123',
    });
    expect(mod.isStripeConfigured()).toBe(true);
  });

  it('APP_URL defaults to smart-tajir.com', async () => {
    const mod = await loadWithEnv({});
    expect(mod.APP_URL).toBe('https://smart-tajir.com');
  });
});
