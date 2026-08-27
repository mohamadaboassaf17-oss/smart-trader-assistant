/* eslint-disable import-x/no-unresolved */
// supabase/functions/stripe-webhook/index.ts — M8 Stripe webhook (Deno Edge Function)
//
// Stripe → Supabase: verifies signature, idempotent via public.stripe_event,
// and maps Stripe subscription lifecycle → profiles.subscription_status /
// subscription_expires_at (GREATEST so a fresher manual renewal is never
// overwritten). Service-role only; no JWT required (Stripe cannot sign it).

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@17.7.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    '[stripe-webhook] missing required env: STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
  );
}

const stripe = new Stripe(STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
});

const supabaseAdmin = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function periodEndToIso(periodEnd: number | null | undefined): string | null {
  if (typeof periodEnd !== 'number' || !Number.isFinite(periodEnd) || periodEnd <= 0) return null;
  return new Date(periodEnd * 1000).toISOString();
}

type ProfileUpdate = {
  subscription_status: 'active' | 'expired';
  subscription_expires_at: string | null;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_price_id?: string;
  updated_at: string;
};

async function upsertStripeEvent(id: string, type: string): Promise<boolean> {
  // Returns true if inserted (first time), false if already existed (idempotent).
  const { error } = await supabaseAdmin
    .from('stripe_event')
    .insert({ id, type }, { count: 'exact' } as unknown as Record<string, unknown>)
    .select('id');
  // Supabase JS doesn't expose inserted count cleanly when using insert;
  // instead we try insert and check for 23505 unique violation.
  if (!error) {
    // No error — treat as inserted. The second attempt will throw 23505.
    return true;
  }
  const msg = String((error as unknown as { message?: string }).message ?? '');
  const code = String((error as unknown as { code?: string }).code ?? '');
  if (code === '23505' || msg.includes('duplicate key') || msg.includes('23505')) {
    console.warn('[stripe-webhook] duplicate event idempotent — already processed', { id, type });
    return false;
  }
  console.error('[stripe-webhook] stripe_event insert failed', { id, type, error: msg, code });
  throw new Error(`stripe_event insert failed: ${msg}`);
}

async function applyProfileUpdate(userId: string, update: ProfileUpdate): Promise<void> {
  // GREATEST guard: never move expiry backwards vs a fresher manual renewal.
  // We fetch existing expiry, then only write if new is later (or currently null).
  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('profiles')
    .select('subscription_expires_at')
    .eq('id', userId)
    .maybeSingle();

  if (fetchErr) {
    console.error('[stripe-webhook] fetch existing profile failed', {
      userId,
      error: fetchErr.message,
    });
    throw new Error(`fetch profile failed: ${fetchErr.message}`);
  }
  if (!existing) {
    console.warn('[stripe-webhook] no profile for user — creating stub', { userId });
  }

  const existingIso =
    (existing as { subscription_expires_at?: string | null } | null)?.subscription_expires_at ??
    null;
  const existingMs = existingIso ? new Date(existingIso).getTime() : 0;
  const incomingMs = update.subscription_expires_at
    ? new Date(update.subscription_expires_at).getTime()
    : 0;
  const shouldAdvanceExpiry =
    !existingIso || (Number.isFinite(incomingMs) && incomingMs > existingMs);

  const payload: Record<string, unknown> = {
    id: userId,
    subscription_status: update.subscription_status,
    updated_at: update.updated_at,
  };
  if (shouldAdvanceExpiry && update.subscription_expires_at) {
    payload['subscription_expires_at'] = update.subscription_expires_at;
  } else if (!shouldAdvanceExpiry) {
    console.info('[stripe-webhook] keeping fresher manual expiry — not moving backwards', {
      userId,
      existingIso,
      incomingIso: update.subscription_expires_at,
    });
  } else if (!update.subscription_expires_at && update.subscription_status === 'expired') {
    // expired without period end — explicitly clear? Keep existing expiry for audit; status drives lock.
    // We still set status=expired but do NOT overwrite expiry if we have no new value.
  }

  if (update.stripe_customer_id) payload['stripe_customer_id'] = update.stripe_customer_id;
  if (update.stripe_subscription_id)
    payload['stripe_subscription_id'] = update.stripe_subscription_id;
  if (update.stripe_price_id) payload['stripe_price_id'] = update.stripe_price_id;

  const { error } = await supabaseAdmin.from('profiles').upsert(payload, { onConflict: 'id' });
  if (error) {
    console.error('[stripe-webhook] profiles upsert failed', {
      userId,
      error: error.message,
      payload,
    });
    throw new Error(`profiles upsert failed: ${error.message}`);
  }
  console.info('[stripe-webhook] profile updated', {
    userId,
    status: update.subscription_status,
    expires_at: payload['subscription_expires_at'] ?? existingIso,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured — missing Stripe/Supabase env' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return json({ error: 'Missing stripe-signature header' }, 400);
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] signature verification failed', { error: msg });
    return json({ error: `Webhook signature verification failed: ${msg}` }, 400);
  }

  console.info('[stripe-webhook] received', { id: event.id, type: event.type });

  // Idempotency: if we've seen this event.id before, ack without re-applying.
  try {
    const inserted = await upsertStripeEvent(event.id, event.type);
    if (!inserted) {
      return json({ received: true, idempotent: true, id: event.id });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Duplicate is not fatal — treat as already processed.
    if (msg.includes('duplicate key') || msg.includes('23505')) {
      return json({ received: true, idempotent: true, id: event.id });
    }
    console.error('[stripe-webhook] idempotency check failed', { error: msg, id: event.id });
    return json({ error: msg }, 500);
  }

  const nowIso = new Date().toISOString();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.client_reference_id as string | null) ??
          (session.metadata?.['supabase_user_id'] as string | undefined) ??
          null;
        if (!userId) {
          console.warn(
            '[stripe-webhook] checkout.session.completed missing client_reference_id/metadata.supabase_user_id',
            {
              sessionId: session.id,
            },
          );
          break;
        }
        const customerId =
          typeof session.customer === 'string'
            ? session.customer
            : ((session.customer as Stripe.Customer | null)?.id ?? null);
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : ((session.subscription as Stripe.Subscription | null)?.id ?? null);

        let periodEnd: number | null = null;
        let priceId: string | null = null;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            periodEnd =
              (sub as unknown as { current_period_end?: number }).current_period_end ?? null;
            const item = (
              sub as unknown as { items?: { data?: Array<{ price?: { id?: string } }> } }
            ).items?.data?.[0];
            priceId = item?.price?.id ?? null;
          } catch (e) {
            console.warn('[stripe-webhook] failed to retrieve subscription for period_end', {
              subscriptionId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        await applyProfileUpdate(userId, {
          subscription_status: 'active',
          subscription_expires_at:
            periodEndToIso(periodEnd) ?? new Date(Date.now() + 30 * 86_400_000).toISOString(),
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: subscriptionId ?? undefined,
          stripe_price_id: priceId ?? undefined,
          updated_at: nowIso,
        });
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id;
        const priceId =
          (sub as unknown as { items?: { data?: Array<{ price?: { id?: string } }> } }).items
            ?.data?.[0]?.price?.id ?? null;
        // Find user by stripe_customer_id or by metadata.
        const metaUserId =
          (sub.metadata as Record<string, string> | null)?.['supabase_user_id'] ?? null;
        let userId: string | null = metaUserId;
        if (!userId) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          userId = (data as { id?: string } | null)?.id ?? null;
        }
        if (!userId) {
          console.warn('[stripe-webhook] subscription event — no user found for customer', {
            customerId,
            subscriptionId: sub.id,
          });
          break;
        }
        const status = sub.status;
        // Stripe statuses: incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused
        const isActiveLike = status === 'active' || status === 'trialing';
        const isCanceled = status === 'canceled' || status === 'incomplete_expired';
        const subscriptionStatus: 'active' | 'expired' = isActiveLike
          ? 'active'
          : isCanceled
            ? 'expired'
            : 'active'; // past_due/unpaid keep active until period end
        const periodEnd =
          (sub as unknown as { current_period_end?: number }).current_period_end ?? null;

        // For past_due/unpaid we still extend expiry if we have a period end, but status stays active.
        // The lock only triggers when period lapses and next event is canceled.
        await applyProfileUpdate(userId, {
          subscription_status: subscriptionStatus,
          subscription_expires_at: periodEndToIso(periodEnd),
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          stripe_price_id: priceId ?? undefined,
          updated_at: nowIso,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === 'string' ? sub.customer : (sub.customer as Stripe.Customer).id;
        const metaUserId =
          (sub.metadata as Record<string, string> | null)?.['supabase_user_id'] ?? null;
        let userId: string | null = metaUserId;
        if (!userId) {
          const { data } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          userId = (data as { id?: string } | null)?.id ?? null;
        }
        if (!userId) {
          console.warn('[stripe-webhook] subscription.deleted — no user for customer', {
            customerId,
          });
          break;
        }
        await applyProfileUpdate(userId, {
          subscription_status: 'expired',
          subscription_expires_at:
            periodEndToIso(
              (sub as unknown as { current_period_end?: number }).current_period_end,
            ) ?? null,
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          updated_at: nowIso,
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : ((invoice.customer as Stripe.Customer | null)?.id ?? null);
        if (!customerId) break;
        // Find user
        const { data } = await supabaseAdmin
          .from('profiles')
          .select('id, subscription_expires_at')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();
        const userId = (data as { id?: string } | null)?.id ?? null;
        if (!userId) {
          console.warn('[stripe-webhook] invoice.payment_succeeded — no user for customer', {
            customerId,
          });
          break;
        }
        // Try to get period end from the subscription on the invoice
        const subId = (invoice as unknown as { subscription?: string }).subscription ?? null;
        let periodEnd: number | null = null;
        if (subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            periodEnd =
              (sub as unknown as { current_period_end?: number }).current_period_end ?? null;
          } catch {
            /* ignore */
          }
        }
        // Fallback: extend by 30 days if we have no period end
        const newExpiry =
          periodEndToIso(periodEnd) ?? new Date(Date.now() + 30 * 86_400_000).toISOString();
        await applyProfileUpdate(userId, {
          subscription_status: 'active',
          subscription_expires_at: newExpiry,
          updated_at: nowIso,
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string'
            ? invoice.customer
            : ((invoice.customer as Stripe.Customer | null)?.id ?? null);
        console.info(
          '[stripe-webhook] invoice.payment_failed — no immediate lock, Stripe will retry',
          {
            customerId,
            invoiceId: invoice.id,
          },
        );
        // Do NOT expire immediately — keep active until current_period_end.
        // Next customer.subscription.updated with status past_due/unpaid will still be active;
        // expiry happens on subscription.deleted or period lapse.
        break;
      }

      default:
        console.info('[stripe-webhook] unhandled event type — acked', {
          type: event.type,
          id: event.id,
        });
        break;
    }

    return json({ received: true, id: event.id, type: event.type });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handler failed', {
      id: event.id,
      type: event.type,
      error: msg,
    });
    // Return 500 so Stripe retries (idempotency protects against double-apply)
    return json({ error: msg }, 500);
  }
});
