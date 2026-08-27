/**
 * Stripe client service (M8).
 *
 * Wraps Supabase Edge Functions `create-checkout-session` and
 * `create-portal-session`. Uses the Supabase JWT for auth so the
 * server can verify the caller.
 */

import { getSupabase } from '@/services/supabase/client';
import { err, ok, tryAsync } from '@/types/result';

import type { Result } from '@/types/result';

function supabaseUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return url?.trim() ? url.trim().replace(/\/$/, '') : null;
}

async function getAccessToken(): Promise<string | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

async function callEdgeFunction(
  functionName: 'create-checkout-session' | 'create-portal-session',
  body: Record<string, unknown>,
): Promise<Result<{ url: string }, string>> {
  const base = supabaseUrl();
  const token = await getAccessToken();
  if (!base) return err('Supabase غير مهيأ');
  if (!token) return err('انتهت الجلسة — سجّل الدخول مجدداً');

  const endpoint = `${base}/functions/v1/${functionName}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // non-JSON
  }

  if (!res.ok) {
    const msg =
      (data as { error?: string } | null)?.error ??
      (data as { message?: string } | null)?.message ??
      text ??
      `HTTP ${res.status}`;
    return err(String(msg).slice(0, 300));
  }

  const url = (data as { url?: string } | null)?.url;
  if (!url || typeof url !== 'string') return err('لم يرجع الخادم رابط الدفع');
  return ok({ url });
}

export function createCheckoutSession(opts?: {
  priceId?: string;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<Result<{ url: string }, string>> {
  return tryAsync(async () => {
    const result = await callEdgeFunction('create-checkout-session', {
      ...(opts?.priceId ? { priceId: opts.priceId } : {}),
      ...(opts?.successUrl ? { successUrl: opts.successUrl } : {}),
      ...(opts?.cancelUrl ? { cancelUrl: opts.cancelUrl } : {}),
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }).then((r) => (r.ok ? ok(r.value) : err(String(r.error))));
}

export function createPortalSession(opts?: {
  returnUrl?: string;
}): Promise<Result<{ url: string }, string>> {
  return tryAsync(async () => {
    const result = await callEdgeFunction('create-portal-session', {
      ...(opts?.returnUrl ? { returnUrl: opts.returnUrl } : {}),
    });
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }).then((r) => (r.ok ? ok(r.value) : err(String(r.error))));
}
