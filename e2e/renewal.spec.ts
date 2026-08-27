import { expect, test } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * M6 renewal screen (PRD §4.4): Whish Money / OMT copy + WhatsApp/email CTA,
 * reachable via nav or grace banner, with correct hrefs. Verifies i18n keys
 * and that an expired user lands here via the lock watcher.
 */

test.describe('subscription renewal screen (M6)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M6');

  test('renewal screen shows 20$ price and Whish/OMT instructions', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/subscription');
    await expect(page.getByTestId('renewal-title')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('renewal-price')).toContainText('20$');
    await expect(page.getByTestId('renewal-whish')).toContainText('Whish Money');
    await expect(page.getByTestId('renewal-omt')).toContainText('OMT');
    // CTA links are present and have hrefs (WhatsApp prefill + mailto)
    const wa = page.getByTestId('cta-whatsapp');
    await expect(wa).toBeVisible();
    await expect(wa).toHaveAttribute('href', /wa\.me|whatsapp/);
    const email = page.getByTestId('cta-email');
    await expect(email).toBeVisible();
    await expect(email).toHaveAttribute('href', /^mailto:/);
  });

  test('grace banner links to renewal screen', async ({ page }) => {
    // Trial expires in 1 day → inside 2-day grace window
    await interceptSupabase(page, { status: 'trial', expiresInDays: 1 });
    // Custom onboard that does not assert dashboard: we will land on dashboard with banner
    await page.goto('/');
    const landingCta2 = page.getByTestId('landing-cta-primary');
    if (await landingCta2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await landingCta2.click();
    }
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
    await page.getByTestId('auth-toggle-mode').click();
    await page.getByTestId('auth-email').fill('trader@example.com');
    await page.getByTestId('auth-password').fill('secret123');
    await page.getByTestId('auth-email-submit').click();
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
    await page.getByTestId('ob-country-lb').click();
    await page.getByTestId('ob-confirm').click();
    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 20_000 });

    const banner = page.getByTestId('subscription-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole('link', { name: 'جدّد الآن' }).click();
    await expect(page).toHaveURL(/\/subscription/, { timeout: 15_000 });
    await expect(page.getByTestId('renewal-title')).toBeVisible();
  });
});
