import { expect, test } from '@playwright/test';

import { interceptSupabase } from './helpers/supabase-mock';

test.describe('M8 landing page (Arabic RTL on /)', () => {
  test('unauthenticated visitors see the marketing landing at /', async ({ page }) => {
    await interceptSupabase(page);
    await page.goto('/');

    await expect(page.getByTestId('landing-badge')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('landing-title')).toContainText('حساباتك اليومية');
    await expect(page.getByTestId('landing-cta-primary')).toBeVisible();
    await expect(page.getByTestId('landing-cta-primary')).toContainText('ابدأ مجاناً');
    await expect(page.getByTestId('landing-pricing')).toContainText('20$');
    await expect(page.getByTestId('landing-features')).toBeVisible();
    await expect(page.getByTestId('landing-faq')).toBeVisible();

    // RTL check
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    expect(dir).toBe('rtl');

    // CTA leads to /auth
    await page.getByTestId('landing-cta-primary').click();
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
  });

  test('protected routes still redirect unauthenticated users to /auth', async ({ page }) => {
    await interceptSupabase(page);
    await page.goto('/sales');
    await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
  });
});
