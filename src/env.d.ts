/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY: string;
  readonly VITE_STRIPE_PRICE_ID: string;
  readonly VITE_PAYMENT_MODE: 'dual' | 'stripe-only' | 'manual';
  readonly VITE_APP_URL: string;
  readonly VITE_ENABLED_COUNTRIES: string;
  readonly VITE_IQD_PEG: string;
  readonly VITE_WHISH_NUMBER: string;
  readonly VITE_OMT_NUMBER: string;
  readonly VITE_SUPPORT_WHATSAPP: string;
  readonly VITE_SUPPORT_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
