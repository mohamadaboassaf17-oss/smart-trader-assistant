/**
 * OCR Vision client (M9) — calls Supabase Edge Function `ocr-receipt`
 * which proxies Google Vision TEXT_DETECTION. Falls back to local parse only.
 */

import { getSupabase } from '@/services/supabase/client';
import { parseOcrText, type OcrParseResult } from '@/utils/ocr-parse';

export interface VisionResult extends OcrParseResult {
  rawText: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1]! : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('blobToBase64 failed'));
    reader.readAsDataURL(blob);
  });
}

export async function callVisionOcr(blob: Blob): Promise<VisionResult> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('no supabase client — cannot call ocr-receipt');

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('not authenticated');

  const base64 = await blobToBase64(blob);

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/ocr-receipt`;

  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ imageBase64: base64 }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => String(res.status));
    throw new Error(`ocr-receipt failed ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    rawText: string;
    amountCents?: number | null;
    currencyGuess?: string | null;
    confidence?: number | null;
  };

  const rawText = json.rawText ?? '';
  // Prefer server parse if present, otherwise local parse
  if (typeof json.amountCents === 'number' || json.currencyGuess) {
    return {
      rawText,
      amountCents: json.amountCents ?? null,
      currencyGuess: (json.currencyGuess as VisionResult['currencyGuess']) ?? null,
      noteCandidate: parseOcrText(rawText).noteCandidate,
      confidence: json.confidence ?? null,
    };
  }

  const parsed = parseOcrText(rawText, json.confidence ?? null);
  return { rawText, ...parsed };
}
