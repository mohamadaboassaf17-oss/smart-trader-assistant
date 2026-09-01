/* eslint-disable import-x/no-unresolved */
// supabase/functions/ocr-receipt/index.ts — M9 OCR proxy (transient) — P1.2 hardened.
//
// POST { imageBase64: string } (JPEG/PNG/WEBP, base64 without data: prefix)
// Auth: Authorization: Bearer <supabase JWT>, verify_jwt=true in config.toml covers the base check;
//       we also call supabase.auth.getUser(jwt) to bind userId for rate limiting.
// Proxies Google Vision TEXT_DETECTION (no image is stored; response is transient).
// Returns { rawText, amountCents, currencyGuess, confidence } parsed via shared heuristics.
// P1.2: persistent DB rate limit (ocr_rate_limit) + X-Goog-Api-Key header + strict base64/magic validation.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

import { corsHeaders } from '../_shared/cors.ts';

const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// Persistent rate limit: 20 req / hour / user via public.ocr_rate_limit.
// Fallback Map kept only for DB failure (per isolate, best-effort).
const RATE_LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function isRateLimitedFallback(userId: string): boolean {
  const now = Date.now();
  const arr = hits.get(userId) ?? [];
  const recent = arr.filter((t) => now - t < WINDOW_MS);
  hits.set(userId, recent);
  return recent.length >= RATE_LIMIT;
}

function recordHitFallback(userId: string): void {
  const arr = hits.get(userId) ?? [];
  arr.push(Date.now());
  hits.set(userId, arr);
}

async function isRateLimited(userId: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data: row, error } = await supabaseAdmin
      .from('ocr_rate_limit')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return false;
    const r = row as { window_start: string; count: number };
    const windowStart = new Date(r.window_start).getTime();
    if (!Number.isFinite(windowStart)) return false;
    if (r.count >= RATE_LIMIT && Date.now() - windowStart < WINDOW_MS) return true;
    return false;
  } catch (e) {
    console.warn('[ocr-receipt] DB rate-limit check failed — fallback to memory', e);
    return isRateLimitedFallback(userId);
  }
}

async function recordHit(userId: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<void> {
  try {
    const { data: row } = await supabaseAdmin
      .from('ocr_rate_limit')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const nowIso = new Date().toISOString();
    if (!row) {
      const { error } = await supabaseAdmin
        .from('ocr_rate_limit')
        .insert({ user_id: userId, window_start: nowIso, count: 1 });
      if (error) throw error;
      return;
    }
    const r = row as { window_start: string; count: number };
    const windowStart = new Date(r.window_start).getTime();
    if (Date.now() - windowStart >= WINDOW_MS) {
      // window expired → reset
      const { error } = await supabaseAdmin
        .from('ocr_rate_limit')
        .update({ window_start: nowIso, count: 1 })
        .eq('user_id', userId);
      if (error) {
        // fallback to upsert if update fails
        await supabaseAdmin
          .from('ocr_rate_limit')
          .upsert({ user_id: userId, window_start: nowIso, count: 1 }, { onConflict: 'user_id' });
      }
    } else {
      const { error } = await supabaseAdmin
        .from('ocr_rate_limit')
        .update({ count: r.count + 1 })
        .eq('user_id', userId);
      if (error) {
        await supabaseAdmin
          .from('ocr_rate_limit')
          .upsert({ user_id: userId, window_start: r.window_start, count: r.count + 1 }, { onConflict: 'user_id' });
      }
    }
  } catch (e) {
    console.warn('[ocr-receipt] DB recordHit failed — fallback to memory', e);
    recordHitFallback(userId);
  }
}

function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function guessCurrency(rawText: string): string | null {
  if (/(ع\.د|IQD|دينار|العراقي)/i.test(rawText)) return 'IQD';
  if (/(ل\.ل|LBP|ليرة لبنانية)/i.test(rawText)) return 'LBP';
  if (/(ل\.س|SYP|ليرة سورية)/i.test(rawText)) return 'SYP';
  if (/(\$|USD|دولار)/i.test(rawText)) return 'USD';
  return null;
}

function extractAmountCents(rawText: string): number | null {
  const normalized = normalizeDigits(rawText);
  const tokens = normalized.match(/[\d][\d\s,.'`]*[\d]|\d/g) ?? [];
  const candidates: number[] = [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/[\s'`]/g, '').replace(/,/g, '');
    const parts = cleaned.split('.');
    let numStr: string;
    if (parts.length > 2) {
      const dec = parts.pop()!;
      numStr = parts.join('') + '.' + dec;
    } else numStr = cleaned;
    const n = Number(numStr);
    if (!Number.isFinite(n) || n <= 0 || n > 1e9) continue;
    candidates.push(n);
  }
  if (candidates.length === 0) return null;
  return Math.round(Math.max(...candidates) * 100);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(req, { error: 'Server not configured' }, 500);

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(req, { error: 'Missing Authorization Bearer token' }, 401);
  const jwt = authHeader.slice(7).trim();
  if (!jwt) return json(req, { error: 'Empty token' }, 401);

  const supabaseAuthed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await supabaseAuthed.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(req, { error: `Invalid session: ${userErr?.message ?? 'no user'}` }, 401);
  const userId = userData.user.id;

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ?? '', {
    auth: { persistSession: false },
  });

  if (await isRateLimited(userId, supabaseAdmin)) return json(req, { error: 'Rate limit: 20 OCR requests per hour' }, 429);

  let body: { imageBase64?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400);
  }

  let imageBase64 = (body.imageBase64 as string | undefined)?.trim();
  if (!imageBase64 || imageBase64.length < 100) return json(req, { error: 'Missing imageBase64' }, 400);

  // P1.2: strip data URI prefix if present (e.g. data:image/jpeg;base64,...)
  const dataUriMatch = imageBase64.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,/);
  if (dataUriMatch) imageBase64 = imageBase64.slice(dataUriMatch[0].length);
  // remove any whitespace/newlines that may have been inserted
  const cleaned = imageBase64.replace(/\s/g, '');

  if (!/^[A-Za-z0-9+/=]+$/.test(cleaned)) return json(req, { error: 'Invalid base64 encoding' }, 400);
  if (cleaned.length > 7_000_000) return json(req, { error: 'Image too large (max 5MB base64)' }, 413);

  // P1.2: validate magic bytes via partial base64 decode
  let decodedBytes: Uint8Array;
  try {
    const binary = atob(cleaned);
    decodedBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return json(req, { error: 'Invalid base64 encoding' }, 400);
  }

  if (decodedBytes.length > 5 * 1024 * 1024) return json(req, { error: 'Image too large (max 5MB decoded)' }, 413);

  if (decodedBytes.length >= 4) {
    const hex = [...decodedBytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    const isJpeg = hex.startsWith('FFD8FF');
    const isPng = hex.startsWith('89504E47');
    const isWebp = hex.startsWith('52494646'); // RIFF header for WEBP
    if (!isJpeg && !isPng && !isWebp) {
      return json(req, { error: 'Unsupported image type (only JPEG, PNG, WEBP)' }, 415);
    }
  } else {
    return json(req, { error: 'Invalid image data' }, 415);
  }

  // Use cleaned base64 for Vision (without data URI)
  const imageContent = cleaned;

  // If no Vision key, return empty parse so the client falls back to manual entry (dev/offline build).
  if (!GOOGLE_VISION_API_KEY) {
    console.warn('[ocr-receipt] GOOGLE_VISION_API_KEY not set — returning empty parse');
    return json(req, { rawText: '', amountCents: null, currencyGuess: null, confidence: null });
  }

  // P1.2: record hit BEFORE Vision call to prevent quota drain via intentional failures
  await recordHit(userId, supabaseAdmin);

  try {
    const visionRes = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_VISION_API_KEY },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageContent },
            features: [{ type: 'TEXT_DETECTION' }],
            imageContext: { languageHints: ['ar', 'en'] },
          },
        ],
      }),
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text().catch(() => String(visionRes.status));
      console.error('[ocr-receipt] Vision API failed', { status: visionRes.status, err: errText.slice(0, 500) });
      return json(req, { error: `Vision API failed ${visionRes.status}` }, 502);
    }

    const j = (await visionRes.json()) as {
      responses?: Array<{ fullTextAnnotation?: { text?: string }; textAnnotations?: Array<{ description?: string }> }>;
      error?: { message?: string };
    };

    if (j.error) return json(req, { error: j.error.message ?? 'Vision error' }, 502);

    const resp = j.responses?.[0];
    const rawText = resp?.fullTextAnnotation?.text ?? resp?.textAnnotations?.[0]?.description ?? '';

    const amountCents = rawText ? extractAmountCents(rawText) : null;
    const currencyGuess = rawText ? guessCurrency(rawText) : null;

    // Vision does not return avg confidence in TEXT_DETECTION; keep null.
    return json(req, { rawText, amountCents, currencyGuess, confidence: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ocr-receipt] proxy error', msg);
    return json(req, { error: msg }, 502);
  }
});
