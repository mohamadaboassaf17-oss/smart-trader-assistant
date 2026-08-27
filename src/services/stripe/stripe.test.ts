import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/supabase/client', () => ({
  getSupabase: vi.fn(),
}));

import { getSupabase } from '@/services/supabase/client';

import { createCheckoutSession, createPortalSession } from './stripe';

const mockGetSupabase = vi.mocked(getSupabase);

function mockClient(token: string | null, supabaseUrl = 'https://proj.supabase.co') {
  vi.stubEnv('VITE_SUPABASE_URL', supabaseUrl);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: token ? { access_token: token } : null },
      }),
    },
  } as unknown as ReturnType<typeof getSupabase>;
  mockGetSupabase.mockReturnValue(client);
  return client;
}

describe('stripe service', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('createCheckoutSession — fails when no Supabase URL', async () => {
    mockClient('tok', '');
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const res = await createCheckoutSession();
    expect(res.ok).toBe(false);
  });

  it('createCheckoutSession — fails when no token', async () => {
    mockClient(null);
    const res = await createCheckoutSession();
    expect(res.ok).toBe(false);
    expect((res as { ok: false; error: string }).error).toMatch(/الجلسة/);
  });

  it('createCheckoutSession — success returns url', async () => {
    mockClient('tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_123' }),
      } as unknown as Response),
    );
    const res = await createCheckoutSession({ priceId: 'price_123' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.url).toContain('checkout.stripe.com');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/create-checkout-session'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('createCheckoutSession — server error surfaces message', async () => {
    mockClient('tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Missing priceId' }),
      } as unknown as Response),
    );
    const res = await createCheckoutSession();
    expect(res.ok).toBe(false);
  });

  it('createPortalSession — success', async () => {
    mockClient('tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ url: 'https://billing.stripe.com/session/abc' }),
      } as unknown as Response),
    );
    const res = await createPortalSession();
    expect(res.ok).toBe(true);
  });

  it('createPortalSession — no customer error', async () => {
    mockClient('tok123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'No Stripe customer linked' }),
      } as unknown as Response),
    );
    const res = await createPortalSession();
    expect(res.ok).toBe(false);
  });
});
