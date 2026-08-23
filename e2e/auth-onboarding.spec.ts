import { expect, test } from '@playwright/test';

import {
  E2E_EMAIL,
  E2E_PASSWORD,
  interceptSupabase,
  signUpAndOnboard,
} from './helpers/supabase-mock';

/**
 * M3 acceptance flow (PRD §4 + §5):
 *   visit app → redirected to /auth → sign up (email) → /onboarding →
 *   pick country → land on dashboard. Session survives reload via IndexedDB.
 */

test.describe('M3 auth & onboarding', () => {
  // GoTrue mock flow is validated on Chromium for M3 (same policy as the
  // offline-sync spec); cross-browser hardening lands in M7.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M3');

  test('sign up → onboard → land on dashboard', async ({ page }) => {
    await interceptSupabase(page);

    await page.goto('/');
    // Guard bounces unauthenticated visitors to /auth.
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
    await expect(page.getByTestId('auth-email')).toBeVisible();

    // Switch to sign-up mode and submit credentials.
    await page.getByTestId('auth-toggle-mode').click();
    await page.getByTestId('auth-email').fill(E2E_EMAIL);
    await page.getByTestId('auth-password').fill(E2E_PASSWORD);
    await page.getByTestId('auth-email-submit').click();

    // No profile yet → guard sends us to onboarding.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });

    // Pick Lebanon and confirm the derived currency.
    await page.getByTestId('ob-country-lb').click();
    await expect(page.getByTestId('ob-currency-summary')).toContainText('ل.ل');
    await page.getByTestId('ob-confirm').click();

    // Land on the dashboard with a visible sync badge.
    await expect(page.getByRole('heading', { name: 'لوحة التحكم', level: 1 })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('sync-badge')).toBeVisible();

    // Reload keeps the session + profile (IndexedDB persistence).
    await page.reload();
    await expect(page.getByRole('heading', { name: 'لوحة التحكم', level: 1 })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('signed-out users cannot reach protected routes directly', async ({ page }) => {
    await interceptSupabase(page);
    await page.goto('/sales');
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
  });

  test('full happy path helper lands onboarded on dashboard', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    await expect(page.getByTestId('sync-badge')).toBeVisible();
  });
});
