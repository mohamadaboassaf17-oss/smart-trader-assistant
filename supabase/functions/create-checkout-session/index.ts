/* eslint-disable import-x/no-unresolved */
// supabase/functions/create-checkout-session/index.ts — M8
//
// Authenticated endpoint: creates a Stripe Checkout Session for the
// $20/mo price and returns { url }. The client redirects to url.
// Requires: Authorization: Bearer <supabase JWT>

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@17.7.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const APP_URL = Deno.env.get('APP_URL') ?? 'https://smart-tajir.com';
const STRIPE_PRICE_ID_FALLBACK = Deno.env.get('STRIPE_PRICE_ID');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Server not configured' }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization Bearer token' }, 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return json({ error: 'Empty token' }, 401);

  // Verify the caller's Supabase user via the JWT
  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: `Invalid session: ${userErr?.message ?? 'no user'}` }, 401);
  }
  const user = userData.user;
  const userId = user.id;
  const userEmail = user.email ?? undefined;

  let body: { priceId?: string; successUrl?: string; cancelUrl?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const priceId = (body.priceId as string | undefined)?.trim() || STRIPE_PRICE_ID_FALLBACK?.trim();
  if (!priceId) return json({ error: 'Missing priceId (and STRIPE_PRICE_ID not set)' }, 400);

  // Look up existing Stripe customer for this user to avoid duplicates
  const supabaseAdmin = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
  let existingCustomerId: string | null = null;
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .maybeSingle();
    existingCustomerId =
      (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  } catch {
    // ignore — will create new customer via checkout
  }

  const successUrl =
    (body.successUrl as string | undefined)?.trim() || `${APP_URL}/subscription?success=1`;
  const cancelUrl =
    (body.cancelUrl as string | undefined)?.trim() || `${APP_URL}/subscription?canceled=1`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: userEmail }),
      client_reference_id: userId,
      subscription_data: { metadata: { supabase_user_id: userId } },
      metadata: { supabase_user_id: userId },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: false,
      billing_address_collection: 'auto',
    });
    if (!session.url) return json({ error: 'Stripe did not return a checkout URL' }, 502);
    return json({ url: session.url, id: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-checkout-session] stripe error', { userId, priceId, error: msg });
    return json({ error: msg }, 502);
  }
});
