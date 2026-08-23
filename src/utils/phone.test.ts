import { describe, expect, it } from 'vitest';

import { isValidMerchantPhone, validateMerchantPhone } from './phone';

describe('validateMerchantPhone — Lebanese mobiles', () => {
  it('accepts the 7-digit 3-prefix family', () => {
    expect(validateMerchantPhone('3123456')).toStrictEqual({
      ok: true,
      value: '+9613123456',
    });
  });

  it('strips the trunk zero of the 3-prefix family', () => {
    expect(validateMerchantPhone('03123456')).toStrictEqual({
      ok: true,
      value: '+9613123456',
    });
  });

  it.each(['70123456', '71123456', '76123456', '78123456', '79123456', '81123456'])(
    'accepts the 8-digit %s-prefix family',
    (local) => {
      expect(validateMerchantPhone(local)).toStrictEqual({
        ok: true,
        value: `+961${local}`,
      });
    },
  );

  it('accepts an explicit +961 with or without a stray trunk zero', () => {
    expect(validateMerchantPhone('+9613123456')).toStrictEqual({
      ok: true,
      value: '+9613123456',
    });
    expect(validateMerchantPhone('+96103123456')).toStrictEqual({
      ok: true,
      value: '+9613123456',
    });
  });
});

describe('validateMerchantPhone — Syrian mobiles', () => {
  it('accepts the bare 9-digit form', () => {
    expect(validateMerchantPhone('912345678')).toStrictEqual({
      ok: true,
      value: '+963912345678',
    });
  });

  it('strips the trunk zero', () => {
    expect(validateMerchantPhone('0912345678')).toStrictEqual({
      ok: true,
      value: '+963912345678',
    });
  });

  it('accepts an explicit +963', () => {
    expect(validateMerchantPhone('+963912345678')).toStrictEqual({
      ok: true,
      value: '+963912345678',
    });
  });
});

describe('validateMerchantPhone — normalization', () => {
  it('ignores spaces, dashes, and parentheses', () => {
    expect(validateMerchantPhone('+961 3 123 456')).toStrictEqual({
      ok: true,
      value: '+9613123456',
    });
    expect(validateMerchantPhone('(0912)-345-678')).toStrictEqual({
      ok: true,
      value: '+963912345678',
    });
  });

  it('is idempotent on already-normalized input', () => {
    expect(validateMerchantPhone('+96170123456')).toStrictEqual({
      ok: true,
      value: '+96170123456',
    });
    expect(validateMerchantPhone('+963912345678')).toStrictEqual({
      ok: true,
      value: '+963912345678',
    });
  });

  it('agrees between the boolean and Result APIs', () => {
    expect(isValidMerchantPhone('70123456')).toBe(true);
    expect(isValidMerchantPhone('12345')).toBe(false);
  });
});

describe('validateMerchantPhone — rejections', () => {
  it('reports blank input as empty', () => {
    expect(validateMerchantPhone('')).toStrictEqual({ ok: false, error: { kind: 'empty' } });
    expect(validateMerchantPhone('   ')).toStrictEqual({ ok: false, error: { kind: 'empty' } });
    expect(validateMerchantPhone('-')).toStrictEqual({ ok: false, error: { kind: 'empty' } });
    expect(validateMerchantPhone('+')).toStrictEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('rejects wrong lengths within a known family', () => {
    expect(validateMerchantPhone('312345')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('31234567')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('91234567')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('9123456789')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('8112345')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
  });

  it('rejects wrong mobile prefixes', () => {
    expect(validateMerchantPhone('72123456')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('80123456')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('5123456')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
  });

  it('rejects garbage characters anywhere in the number', () => {
    expect(validateMerchantPhone('abc123')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
    expect(validateMerchantPhone('70123ab6')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
  });

  it('rejects +-prefixed numbers from other countries as unknownCountry', () => {
    expect(validateMerchantPhone('+33123456789')).toStrictEqual({
      ok: false,
      error: { kind: 'unknownCountry' },
    });
    expect(validateMerchantPhone('+441234567890')).toStrictEqual({
      ok: false,
      error: { kind: 'unknownCountry' },
    });
    expect(validateMerchantPhone('+971501234567')).toStrictEqual({
      ok: false,
      error: { kind: 'unknownCountry' },
    });
  });

  it('routes an explicit but malformed 96x prefix to invalidFormat, not unknownCountry', () => {
    expect(validateMerchantPhone('+9612345')).toStrictEqual({
      ok: false,
      error: { kind: 'invalidFormat' },
    });
  });
});
