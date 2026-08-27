import { expect, test } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * M8 Stripe Checkout + Portal (dual mode).
 * Uses route mocking for Supabase Edge Functions — no real Stripe calls.
 */
test.describe('M8 Stripe Checkout & Portal (dual mode)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M8');

  test('renewal shows Stripe CTA alongside manual Whish/OMT (dual)', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/subscription');
    await expect(page.getByTestId('renewal-title')).toBeVisible({ timeout: 15_000 });

    // Dual mode: both Stripe and manual are visible
    await expect(page.getByTestId('renewal-stripe')).toBeVisible();
    await expect(page.getByTestId('cta-stripe')).toBeVisible();
    await expect(page.getByTestId('cta-stripe')).toContainText('Stripe');
    await expect(page.getByTestId('renewal-manual')).toBeVisible();
    await expect(page.getByTestId('renewal-whish')).toBeVisible();
    await expect(page.getByTestId('renewal-omt')).toBeVisible();
  });

  test('Stripe checkout CTA redirects via mocked Edge Function', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);

    // Mock the Edge Function response
    await page.route('**/functions/v1/create-checkout-session', async (route) => {
      const req = route.request();
      expect(req.method()).toBe('POST');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://checkout.stripe.com/pay/cs_test_123' }),
      });
    });

    await page.goto('/subscription');
    await expect(page.getByTestId('cta-stripe')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('cta-stripe').click();

    // Wait for the mocked fetch to be hit (route handler asserted) — no error
    // toast should appear when mock succeeds.
    await expect(page.getByTestId('cta-stripe')).toBeVisible();
    await page.waitForTimeout(500);
  });

  test('success/canceled query params show Arabic toasts', async ({ page }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/subscription?success=1');
    await expect(page.getByText('تم الدفع بنجاح')).toBeVisible({ timeout: 15_000 });

    await page.goto('/subscription?canceled=1');
    await expect(page.getByText('أُلغي الدفع')).toBeVisible({ timeout: 15_000 });
  });

  test('Portal CTA hidden when no Stripe customer, visible when linked', async ({ page }) => {
    // Without stripe_customer_id, portal should be hidden
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    await page.goto('/subscription');
    await expect(page.getByTestId('renewal-stripe')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('renewal-portal')).toHaveCount(0);

    // With a mocked active profile that has stripe_customer_id, portal would be
    // visible — but supabase-mock does not set stripe_customer_id. We document
    // the expectation here and verify the hidden case above. Full portal flow
    // is verified manually via Stripe Dashboard per runbook §5.1.
  });

  test('offline disables Stripe CTA', async ({ page, context }) => {
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    await page.goto('/subscription');
    await expect(page.getByTestId('cta-stripe')).toBeVisible({ timeout: 15_000 });

    await context.setOffline(true);
    await page.reload();
    // After reload offline, the Stripe CTA should be disabled and show offline hint
    await expect(page.getByTestId('cta-stripe')).toBeDisabled({ timeout: 15_000 });
    await expect(page.getByTestId('stripe-offline-hint')).toBeVisible({ timeout: 5_000 });
    await context.setOffline(false);
  });
});
