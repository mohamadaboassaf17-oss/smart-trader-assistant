import { describe, expect, it } from 'vitest';

import { CONTACT, mailtoUrl, whatsappUrl } from './contact';

describe('CONTACT defaults', () => {
  it('falls back to obvious placeholders when no env vars are set', () => {
    expect(CONTACT.whishNumber).toBe('XXXXXXXXXX');
    expect(CONTACT.omtNumber).toBe('XXXXXXXXXX');
    expect(CONTACT.supportWhatsapp).toBe('XXXXXXXXXX');
    expect(CONTACT.supportEmail).toBe('support@example.com');
  });
});

describe('whatsappUrl()', () => {
  it('builds a bare wa.me link from the configured number', () => {
    expect(whatsappUrl()).toBe(`https://wa.me/${CONTACT.supportWhatsapp}`);
  });

  it('URL-encodes the prefilled message exactly once', () => {
    const url = whatsappUrl('تجديد اشتراك المساعد الذكي للتاجر');
    const parsed = new URL(url);
    expect(`${parsed.protocol}//${parsed.host}`).toBe('https://wa.me');
    expect(parsed.pathname.slice(1)).toBe(CONTACT.supportWhatsapp);
    expect(parsed.searchParams.get('text')).toBe('تجديد اشتراك المساعد الذكي للتاجر');
  });
});

describe('mailtoUrl()', () => {
  it('targets the support address with no query when no subject is given', () => {
    expect(mailtoUrl()).toBe(`mailto:${CONTACT.supportEmail}`);
  });

  it('encodes the subject parameter', () => {
    const parsed = new URL(mailtoUrl('تجديد اشتراك المساعد الذكي للتاجر'));
    expect(parsed.protocol).toBe('mailto:');
    expect(parsed.pathname).toBe(CONTACT.supportEmail);
    expect(parsed.searchParams.get('subject')).toBe('تجديد اشتراك المساعد الذكي للتاجر');
  });
});
