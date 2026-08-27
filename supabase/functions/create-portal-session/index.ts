/* eslint-disable import-x/no-unresolved */
// supabase/functions/create-portal-session/index.ts — M8
//
// Authenticated endpoint: creates a Stripe Billing Portal session for the
// caller (update card / cancel only). Returns { url }.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import Stripe from 'npm:stripe@17.7.0';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const APP_URL = Deno.env.get('APP_URL') ?? 'https://smart-tajir.com';

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

  if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500);
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing Authorization Bearer token' }, 401);
  }
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return json({ error: 'Empty token' }, 401);

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return json({ error: `Invalid session: ${userErr?.message ?? 'no user'}` }, 401);
  }
  const userId = userData.user.id;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileErr) {
    console.error('[create-portal-session] profile fetch failed', {
      userId,
      error: profileErr.message,
    });
    return json({ error: profileErr.message }, 500);
  }
  const customerId =
    (profile as { stripe_customer_id?: string | null } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    return json({ error: 'No Stripe customer linked to this account — subscribe first' }, 404);
  }

  let body: { returnUrl?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    // ignore — use default returnUrl
  }
  const returnUrl = (body.returnUrl as string | undefined)?.trim() || `${APP_URL}/subscription`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[create-portal-session] stripe error', { userId, customerId, error: msg });
    return json({ error: msg }, 502);
  }
});
