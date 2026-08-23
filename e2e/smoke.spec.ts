import { expect, test } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

test.describe('M1 app shell', () => {
  test('renders the Arabic title and an RTL document', async ({ page }) => {
    await interceptSupabase(page);
    await page.goto('/');
    // Unauthenticated visitors land on /auth; the Arabic app name is in the
    // document title either way.
    await expect(page).toHaveTitle(/مساعد ذكي للتاجر/);
    const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'));
    const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'));
    expect(dir).toBe('rtl');
    expect(lang).toBe('ar');
  });
});

// Authenticated navigation depends on the mocked GoTrue flow, which is
// validated on Chromium for M3 (same policy as the other auth-dependent
// specs); cross-browser hardening lands in M7.
test.describe('M1 app shell (authenticated)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M3');

  test('the navigation reveals all M1 routes', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    for (const label of [
      'لوحة التحكم',
      'المبيعات',
      'المشتريات',
      'الموردون',
      'المخزون',
      'الالتزامات',
      'الملاحظات',
      'الأهداف',
    ]) {
      await expect(page.getByRole('navigation').getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('clicking a nav link updates the URL and header', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    await page.getByRole('link', { name: 'المبيعات' }).click();
    await expect(page).toHaveURL(/\/sales$/);
    await expect(page.getByRole('heading', { name: 'المبيعات', level: 1 })).toBeVisible();
  });
});
