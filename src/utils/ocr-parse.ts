/**
 * OCR receipt parsing — client + Edge Function shared heuristics (M9).
 *
 * Extracts a monetary amount and currency guess from Vision TEXT_DETECTION rawText.
 * Heavily tolerant: strips Arabic/English noise, keeps digits + separators.
 * Validation: rawText ≤5000 and noteCandidate via zText(60) (sanitize + bidi strip).
 */
import { zText, sanitizeText } from '@/schemas';

export type OcrCurrencyGuess = 'USD' | 'LBP' | 'SYP' | 'IQD';

export interface OcrParseResult {
  amountCents: number | null;
  currencyGuess: OcrCurrencyGuess | null;
  noteCandidate: string | null;
  confidence: number | null;
}

const IQD_TOKENS = /(ع\.د|IQD|دينار|العراقي)/i;
const LBP_TOKENS = /(ل\.ل|LBP|ليرة لبنانية)/i;
const SYP_TOKENS = /(ل\.س|SYP|ليرة سورية)/i;
const USD_TOKENS = /(\$|USD|دولار)/i;

/**
 * Find currency hint in raw text.
 * Priority: explicit IQD/LBP/SYP token > USD token > null.
 */
export function guessCurrency(rawText: string): OcrCurrencyGuess | null {
  if (IQD_TOKENS.test(rawText)) return 'IQD';
  if (LBP_TOKENS.test(rawText)) return 'LBP';
  if (SYP_TOKENS.test(rawText)) return 'SYP';
  if (USD_TOKENS.test(rawText)) return 'USD';
  return null;
}

/**
 * Extract the most plausible monetary amount from raw OCR text.
 * Strategy: find all number-like tokens (with Arabic-Indic digits normalized)
 * and pick the largest plausible value (receipts: total is max).
 * Returns cents (int) or null.
 */
export function extractAmountCents(rawText: string): number | null {
  const normalized = normalizeDigits(rawText);
  // Match numbers like 12, 12.34, 12,345 — space only (no \n), so lines don't merge
  const tokens = normalized.match(/\d[\d ,.'`]*\d|\d/g) ?? [];
  const candidates: number[] = [];
  for (const tok of tokens) {
    const cleaned = tok.replace(/[\s'`]/g, '').replace(/,/g, '');
    // Handle multiple dots: keep last as decimal
    const parts = cleaned.split('.');
    let numStr: string;
    if (parts.length > 2) {
      const dec = parts.pop()!;
      numStr = parts.join('') + '.' + dec;
    } else {
      numStr = cleaned;
    }
    const n = Number(numStr);
    if (!Number.isFinite(n) || n <= 0 || n > 1e9) continue;
    // Heuristic: ignore tiny page numbers / quantities < 1 (but keep cents granularity later)
    candidates.push(n);
  }
  if (candidates.length === 0) return null;
  // Largest is likely total; convert to cents
  const largest = Math.max(...candidates);
  return Math.round(largest * 100);
}

function normalizeDigits(s: string): string {
  // Arabic-Indic ٠-٩ → 0-9, Eastern Arabic ۰-۹ → 0-9, Arabic separators ٫ ٬
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[٬،]/g, ',');
}

export function parseOcrText(rawText: string, avgConfidence?: number | null): OcrParseResult {
  // Sanitize rawText to ≤5000 with bidi stripping (zod central helper)
  const sanitizedRaw = sanitizeText(rawText ?? '', 5000);
  if (!sanitizedRaw)
    return { amountCents: null, currencyGuess: null, noteCandidate: null, confidence: null };
  const amountCents = extractAmountCents(sanitizedRaw);
  const currencyGuess = guessCurrency(sanitizedRaw);
  // First non-empty line as note candidate — validated via zText(60)
  const firstLine =
    sanitizedRaw
      .split('\n')
      .map((l) => l.trim())
      .find(Boolean) ?? null;
  let noteCandidate: string | null = null;
  if (firstLine) {
    const parsed = zText(60).safeParse(firstLine);
    if (parsed.success) noteCandidate = parsed.data;
    else {
      // Fallback: short or invalid candidate is still sanitized but truncated
      const fallback = sanitizeText(firstLine, 60);
      noteCandidate = fallback.length >= 2 ? fallback : null;
    }
  }
  const confidence =
    typeof avgConfidence === 'number' && Number.isFinite(avgConfidence) ? avgConfidence : null;
  return { amountCents, currencyGuess, noteCandidate, confidence };
}
