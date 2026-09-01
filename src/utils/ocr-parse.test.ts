import { describe, expect, it } from 'vitest';

import { extractAmountCents, guessCurrency, parseOcrText } from './ocr-parse';

describe('guessCurrency', () => {
  it('detects IQD', () => {
    expect(guessCurrency('المجموع 12,000 ع.د')).toBe('IQD');
    expect(guessCurrency('IQD 5000')).toBe('IQD');
  });
  it('detects USD', () => {
    expect(guessCurrency('Total $12.34')).toBe('USD');
  });
  it('returns null when unknown', () => {
    expect(guessCurrency('المجموع 1234')).toBeNull();
  });
});

describe('extractAmountCents', () => {
  it('picks largest amount as total', () => {
    expect(extractAmountCents('1.00\n 2.50\n TOTAL 15.00')).toBe(1500);
  });
  it('handles Arabic-Indic digits', () => {
    expect(extractAmountCents('١٢٫٣٤')).toBe(1234);
    expect(extractAmountCents('١٢٠٠٠ ع.د')).toBe(1_200_000);
  });
  it('handles commas', () => {
    expect(extractAmountCents('12,000 IQD')).toBe(1_200_000);
  });
  it('returns null for empty', () => {
    expect(extractAmountCents('')).toBeNull();
    expect(extractAmountCents('no numbers here')).toBeNull();
  });
});

describe('parseOcrText', () => {
  it('parses amount + currency + note', () => {
    const r = parseOcrText('فاتورة كهرباء\nالمجموع 25,000 ع.د', 0.92);
    expect(r.amountCents).toBe(2_500_000);
    expect(r.currencyGuess).toBe('IQD');
    expect(r.confidence).toBe(0.92);
  });
});
