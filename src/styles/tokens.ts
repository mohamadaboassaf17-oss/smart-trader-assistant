/**
 * Design tokens for Smart Trader Assistant.
 * Imported as a TS module so non-CSS callers (e.g. inline styles in components,
 * tests, storybook) can read them. The CSS-side mirror lives in `src/style.css`.
 */

export const colors = {
  brand: {
    50: '#f0fdfa',
    100: '#ccfbf1',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    900: '#134e4a',
  },
  bg: '#f8fafc',
  surface: '#ffffff',
  surface2: '#f1f5f9',
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',
  text: '#0f172a',
  textMuted: '#64748b',
  textInverse: '#ffffff',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
} as const;

export const space = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

export const fontSize = {
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.875rem',
} as const;

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  full: '9999px',
} as const;

export const layout = {
  maxWidth: '480px',
  headerHeight: '56px',
  tapTargetMin: '44px',
} as const;

export type ColorToken = keyof typeof colors;
