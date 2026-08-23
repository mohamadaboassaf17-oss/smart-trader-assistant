import { describe, expect, it } from 'vitest';

import { mapAuthError } from './auth';

describe('mapAuthError → i18n keys', () => {
  it.each([
    ['Invalid login credentials', 'invalidCredentials'],
    ['Email not confirmed', 'invalidCredentials'],
    ['User already registered', 'emailInUse'],
    ['Password should be at least 6 characters', 'weakPassword'],
    ['Invalid or expired OTP', 'invalidOtp'],
    ['Failed to fetch', 'network'],
  ] as const)('%s → %s', (message, expected) => {
    expect(mapAuthError(new Error(message))).toBe(expected);
  });

  it('falls back to unknown for unmapped errors', () => {
    expect(mapAuthError(new Error('weird server hiccup'))).toBe('unknown');
    expect(mapAuthError('not an error object')).toBe('unknown');
  });
});
