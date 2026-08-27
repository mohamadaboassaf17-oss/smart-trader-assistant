/**
 * Beta payment & support contacts (PRD §4.3–§4.5).
 *
 * Real Whish Money / OMT numbers and support channels arrive via `.env`
 * before beta launch (owner action):
 *   VITE_WHISH_NUMBER, VITE_OMT_NUMBER, VITE_SUPPORT_WHATSAPP, VITE_SUPPORT_EMAIL
 *
 * The placeholder defaults are intentionally obvious ("XXXXXXXXXX") so an
 * unconfigured build can never be mistaken for a real number. Everything in
 * this module is PUBLIC contact information by design — never store secrets
 * here.
 */

const PLACEHOLDER = 'XXXXXXXXXX';

/** Minimal read-time validation: trim whitespace, fall back when empty. */
function fromEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export const CONTACT = {
  /** Whish Money transfer number shown on the renewal screen. */
  whishNumber: fromEnv(import.meta.env.VITE_WHISH_NUMBER, PLACEHOLDER),
  /** OMT transfer number shown on the renewal screen. */
  omtNumber: fromEnv(import.meta.env.VITE_OMT_NUMBER, PLACEHOLDER),
  /** Digits-only WhatsApp number for wa.me deep links. */
  supportWhatsapp: fromEnv(import.meta.env.VITE_SUPPORT_WHATSAPP, PLACEHOLDER),
  /** Support inbox for mailto links. */
  supportEmail: fromEnv(import.meta.env.VITE_SUPPORT_EMAIL, 'support@example.com'),
} as const;

/** `https://wa.me/<digits>(?text=<encoded>)` for the renewal WhatsApp CTA. */
export function whatsappUrl(text?: string): string {
  return text === undefined
    ? `https://wa.me/${CONTACT.supportWhatsapp}`
    : `https://wa.me/${CONTACT.supportWhatsapp}?text=${encodeURIComponent(text)}`;
}

/** `mailto:<support>(?subject=<encoded>)` for the renewal email CTA. */
export function mailtoUrl(subject?: string): string {
  return subject === undefined
    ? `mailto:${CONTACT.supportEmail}`
    : `mailto:${CONTACT.supportEmail}?subject=${encodeURIComponent(subject)}`;
}
