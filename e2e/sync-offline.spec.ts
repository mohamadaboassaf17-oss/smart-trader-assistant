import { expect, test, type Page } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * PRD §7.1 acceptance flow (M2):
 *   go offline → add a sale → come back online → badge flips to ✅.
 *
 * Supabase is mocked at the same origin (`/api-mock/**`); the trader signs
 * up first (M3 guards), then the offline sync pipeline runs end-to-end.
 */

const SYNC_PENDING = 'في انتظار الإنترنت';
const SYNC_SAVED = 'تم الحفظ';

function usdField(page: Page) {
  return page.getByRole('textbox', { name: 'كاش بالدولار' });
}
function localField(page: Page) {
  return page.getByRole('textbox', { name: /كاش بالـ/ });
}
function rateField(page: Page) {
  return page.getByRole('textbox', { name: 'سعر الصرف اليومي' });
}

test.describe('offline sale sync', () => {
  // Service worker + offline emulation quirks make this flow Chromium-only
  // for M2; cross-browser hardening lands in M7.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M2');

  test('offline sale is queued ⏳ and synced ✅ after coming online', async ({ page, context }) => {
    await interceptSupabase(page);

    // Route-level offline gate (backported from the M4 spec). Playwright's
    // `context.setOffline()` alone does NOT stop route-intercepted requests —
    // the api-mock fulfills them without ever touching the network, so an
    // auto-flush right after save could succeed "while offline" and race the
    // ⏳ assertion below. Registered AFTER interceptSupabase so this handler
    // runs first and falls through to the mock whenever we are "online".
    const offlineGate = { blocking: false };
    await page.route('**/api-mock/**', async (route) => {
      if (offlineGate.blocking) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fallback();
    });
    await signUpAndOnboard(page);

    await page.goto('/sales');
    const badge = page.getByTestId('sync-badge');

    // Baseline: queue empty → saved.
    await expect(badge).toHaveAttribute('aria-label', SYNC_SAVED, { timeout: 15_000 });

    // ── Offline ────────────────────────────────────────────────────────────
    offlineGate.blocking = true;
    await context.setOffline(true);
    await usdField(page).fill('25');
    await localField(page).fill('250000'); // 250,000 ل.ل
    await rateField(page).fill('89500');

    await expect(page.getByTestId('sales-total-preview')).toContainText('$27.79');

    await page.getByTestId('sales-save').click();

    // Optimistic save → row stored locally, op queued → pending badge.
    await expect(page.getByTestId('sales-saved-total')).toContainText('$27.79');
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 10_000 });

    // ── Back online ────────────────────────────────────────────────────────
    offlineGate.blocking = false; // mock reachable again before the flush
    await context.setOffline(false);
    await expect(badge).toHaveAttribute('aria-label', SYNC_SAVED, { timeout: 20_000 });
  });

  test('sale screen survives an offline reload via the precached app shell', async ({
    page,
    context,
  }) => {
    await interceptSupabase(page);

    // Same route-level offline gate as above, so nothing route-intercepted
    // sneaks through while the network is cut.
    const offlineGate = { blocking: false };
    await page.route('**/api-mock/**', async (route) => {
      if (offlineGate.blocking) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fallback();
    });
    await signUpAndOnboard(page);

    await page.goto('/sales');
    await expect(page.getByTestId('sales-save')).toBeVisible({ timeout: 15_000 });

    // Ensure the SW is active AND controlling this page before cutting the
    // network, otherwise the reload has nothing to serve it.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null), {
        timeout: 10_000,
      })
      .not.toBeNull();

    offlineGate.blocking = true;
    await context.setOffline(true);
    await page.reload();
    // Precache serves the shell; IndexedDB restores session + profile so
    // the auth guard passes offline too.
    await expect(page.getByTestId('sales-save')).toBeVisible({ timeout: 15_000 });
  });
});
