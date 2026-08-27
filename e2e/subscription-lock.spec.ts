import { expect, test, type Page } from '@playwright/test';

import { E2E_EMAIL, E2E_PASSWORD, interceptSupabase } from './helpers/supabase-mock';

/**
 * M6 subscription lock + grace banner (PRD §4.3–§4.5):
 *   1. an ONLINE sync pulls an EXPIRED profile → router locks to
 *      /subscription (lock survives reload via the session KV flag);
 *   2. a trial inside the 2-day grace window shows the renewal banner but
 *      never redirects;
 *   3. an ACTIVE profile → no redirect, no banner.
 *
 * The canned profile row is served by supabase-mock (see interceptSupabase's
 * optional second argument).
 */

test.describe('subscription lock & grace banner (M6)', () => {
  // GoTrue/PostgREST mock flow is validated on Chromium for M6 (same policy
  // as the M3/M2 specs); cross-browser hardening lands in M7.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M6');

  /**
   * Sign up + pick Lebanon WITHOUT asserting the landing route: with an
   * expired server profile the app may land on /subscription directly, so
   * the shared helper's dashboard assertions would be wrong here.
   */
  async function signUpAndPickCountry(page: Page): Promise<void> {
    await page.goto('/');
    const landingCta = page.getByTestId('landing-cta-primary');
    if (await landingCta.isVisible({ timeout: 2000 }).catch(() => false)) {
      await landingCta.click();
    }
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
    await page.getByTestId('auth-toggle-mode').click();
    await page.getByTestId('auth-email').fill(E2E_EMAIL);
    await page.getByTestId('auth-password').fill(E2E_PASSWORD);
    await page.getByTestId('auth-email-submit').click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await page.getByTestId('ob-country-lb').click();
    await page.getByTestId('ob-confirm').click();
  }

  test('confirmed-online expiry locks the app to /subscription', async ({ page }) => {
    // Founder flipped subscription_expires_at in Supabase three days ago.
    await interceptSupabase(page, { status: 'expired', expiresInDays: -3 });
    await signUpAndPickCountry(page);

    // Either the first navigation hits the locked guard, or the post-sync
    // watcher evicts us from the dashboard — both end at /subscription.
    await expect(page).toHaveURL(/\/subscription/, { timeout: 20_000 });
    await expect(page.getByTestId('renewal-title')).toBeVisible({ timeout: 15_000 });

    // Locked UI shows no grace banner anywhere.
    await expect(page.getByTestId('subscription-banner')).toHaveCount(0);

    // Reload keeps the lock (session KV flag survives cold starts).
    await page.reload();
    await expect(page).toHaveURL(/\/subscription/, { timeout: 20_000 });
    await expect(page.getByTestId('renewal-title')).toBeVisible({ timeout: 15_000 });
  });

  test('trial inside the grace window shows the banner without locking', async ({ page }) => {
    await interceptSupabase(page, { status: 'trial', expiresInDays: 1 });
    await signUpAndPickCountry(page);

    // Stays usable…
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'لوحة التحكم', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    // …and warns after the confirming flush pulls the near-expiry profile.
    const banner = page.getByTestId('subscription-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('جدّد الآن');

    // Renewal link navigates to the renewal screen.
    await banner.getByRole('link', { name: 'جدّد الآن' }).click();
    await expect(page).toHaveURL(/\/subscription/, { timeout: 15_000 });
    await expect(page.getByTestId('renewal-title')).toBeVisible();
  });

  test('active profile → no redirect and no banner', async ({ page }) => {
    await interceptSupabase(page, { status: 'active' });
    await signUpAndPickCountry(page);

    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'لوحة التحكم', level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    // Give any in-flight flush time to evaluate, then confirm no lock/banner.
    await page.waitForTimeout(1500);
    await expect(page).not.toHaveURL(/\/subscription/);
    await expect(page.getByTestId('subscription-banner')).toHaveCount(0);
  });
});
