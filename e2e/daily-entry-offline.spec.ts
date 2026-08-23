import { expect, test, type Page } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * M4 item 12 — one complete trading day entered OFFLINE end-to-end
 * (PRD §6.1 sale + §6.2 side purchase + §6.7 daily note), then an offline
 * reload proving IndexedDB durability, then back online where the queue
 * flushes and statuses flip ⏳ → ✅ (PRD §7.1).
 *
 * Entry-interaction budget (PRD): under 3 minutes for steps sale +
 * purchase + notes. The real wall-clock is measured, logged and attached.
 */

const SYNC_PENDING = 'في انتظار الإنترنت';
const SYNC_SAVED = 'تم الحفظ';

// Day numbers — deliberately distinct from sync-offline.spec so the total
// formula is verified independently (usd_cents + round(local_cents / rate)).
const SALE_USD_TEXT = '40';
const SALE_LOCAL_TEXT = '500000'; // ل.ل typed as a human amount
const RATE_TEXT = '90000';
const SALE_USD_CENTS = 4_000;
const SALE_LOCAL_CENTS = 50_000_000;
const RATE = 90_000;

const PURCHASE_LOCAL_TEXT = '100000'; // ل.ل
const PURCHASE_LOCAL_CENTS = 10_000_000;
const PURCHASE_NOTE = 'كهرباء';

const NOTE_ONE = 'شراء أكياس بلاستيك';
const NOTE_TWO = 'تذكير: دفع فاتورة الكهرباء غداً';

/** Mirrors `formatMoney(cents, 'USD')` (en-US currency style). */
function usd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const EXPECTED_SALE_TOTAL = usd(SALE_USD_CENTS + Math.round(SALE_LOCAL_CENTS / RATE));
const EXPECTED_PURCHASE_USD = usd(Math.round(PURCHASE_LOCAL_CENTS / RATE));

function usdField(page: Page) {
  return page.getByRole('textbox', { name: 'كاش بالدولار' });
}
function localField(page: Page) {
  return page.getByRole('textbox', { name: /كاش بالـ/ });
}
function rateField(page: Page) {
  return page.getByRole('textbox', { name: 'سعر الصرف اليومي' });
}

test.describe('offline full-day entry', () => {
  // Service worker + offline emulation quirks make this Chromium-only for
  // M4, same rationale as sync-offline.spec (cross-browser lands in M7).
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M4');

  test('sale, side purchase and notes entered offline survive reload and sync ✅ back online', async ({
    page,
    context,
  }) => {
    // Full-day flow: auth + SW warmup + three entries + offline reload +
    // queue flush — far beyond the 30s default.
    test.setTimeout(180_000);

    await interceptSupabase(page);

    // Route-level offline gate. Playwright's `context.setOffline()` alone
    // does NOT stop route-intercepted requests — the api-mock fulfills them
    // without ever touching the network, so queue flushes would silently
    // succeed "while offline" and the reload-durability step would see an
    // empty queue. Registered AFTER interceptSupabase so this handler runs
    // first and falls through to the mock whenever we are "online".
    const offlineGate = { blocking: false };
    await page.route('**/api-mock/**', async (route) => {
      if (offlineGate.blocking) {
        await route.abort('internetdisconnected');
        return;
      }
      await route.fallback();
    });
    await signUpAndOnboard(page);

    // The service worker must be active AND controlling before cutting the
    // network, otherwise the mid-test offline reload has nothing to serve.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null), {
        timeout: 10_000,
      })
      .not.toBeNull();

    const badge = page.getByTestId('sync-badge');
    await expect(badge).toHaveAttribute('aria-label', SYNC_SAVED, { timeout: 15_000 });

    // ── Offline ──────────────────────────────────────────────────────────
    offlineGate.blocking = true;
    await context.setOffline(true);

    // Step 1 — daily sale (PRD §6.1): optimistic preview → save → ⏳.
    await page.goto('/sales');
    const entryStart = Date.now();

    await usdField(page).fill(SALE_USD_TEXT);
    await localField(page).fill(SALE_LOCAL_TEXT);
    await rateField(page).fill(RATE_TEXT);

    await expect(page.getByTestId('sales-total-preview')).toContainText(EXPECTED_SALE_TOTAL);
    await page.getByTestId('sales-save').click();
    await expect(page.getByTestId('sales-saved-total')).toContainText(EXPECTED_SALE_TOTAL, {
      timeout: 10_000,
    });
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 10_000 });

    // Step 2 — impulse side purchase via the thumb-zone FAB (PRD §6.2).
    // The FAB is scoped to the purchases screen, so the trader navigates
    // there first (UX friction noted in the test report).
    await page.goto('/purchases');
    await page.getByTestId('purchase-fab').click();
    const dialog = page.getByTestId('purchase-dialog');
    await expect(dialog).toBeVisible();

    // Local currency is the default choice; tapping it keeps intent explicit.
    await dialog.getByRole('radio', { name: 'بالـل.ل' }).click();
    await dialog.getByRole('textbox', { name: /^المبلغ بالـ/ }).fill(PURCHASE_LOCAL_TEXT);
    await expect(page.getByTestId('purchase-preview')).toContainText(EXPECTED_PURCHASE_USD);
    await page.getByTestId('purchase-note').fill(PURCHASE_NOTE);
    await page.getByTestId('purchase-save').click();

    await expect(dialog).toBeHidden();
    const purchaseList = page.getByTestId('purchases-list');
    await expect(purchaseList).toBeVisible({ timeout: 10_000 });
    await expect(purchaseList).toContainText(EXPECTED_PURCHASE_USD);
    await expect(purchaseList).toContainText(PURCHASE_NOTE);

    // Step 3 — two fast daily notes (PRD §6.7); newest-first ordering.
    await page.goto('/notes');
    const composerInput = page.getByTestId('note-add-input');
    const addNote = async (text: string): Promise<void> => {
      await composerInput.fill(text);
      await page.getByTestId('note-add-submit').click();
      await expect(composerInput).toHaveValue('', { timeout: 10_000 }); // cleared on save
    };
    await addNote(NOTE_ONE);
    await addNote(NOTE_TWO);

    const noteBodies = page.getByTestId('notes-list').getByTestId('note-body');
    await expect(noteBodies.first()).toHaveText(NOTE_TWO);
    await expect(noteBodies.nth(1)).toHaveText(NOTE_ONE);

    const entryMs = Date.now() - entryStart;
    console.log(
      `[daily-entry-offline] sale+purchase+notes wall-clock: ${entryMs} ms (budget < 180000 ms)`,
    );
    await test.info().attach('entry-duration.txt', { body: `${entryMs} ms` });
    expect(entryMs, 'PRD 3-minute entry budget').toBeLessThan(180_000);

    // ── Still offline: reload proves IndexedDB-first durability ──────────
    await page.reload();
    await expect(page.getByTestId('note-add-input')).toBeVisible({ timeout: 15_000 });

    await page.goto('/sales');
    await expect(page.getByTestId('sales-save')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('sales-saved-total')).toContainText(EXPECTED_SALE_TOTAL);
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 15_000 });

    await page.goto('/purchases');
    const reloadedPurchases = page.getByTestId('purchases-list');
    await expect(reloadedPurchases).toBeVisible({ timeout: 15_000 });
    await expect(reloadedPurchases).toContainText(EXPECTED_PURCHASE_USD);
    await expect(reloadedPurchases).toContainText(PURCHASE_NOTE);

    await page.goto('/notes');
    const reloadedNotes = page.getByTestId('notes-list').getByTestId('note-body');
    await expect(reloadedNotes.first()).toHaveText(NOTE_TWO, { timeout: 15_000 });
    await expect(reloadedNotes.nth(1)).toHaveText(NOTE_ONE);

    // ── Back online: queue flushes → ✅, totals unchanged ────────────────
    await page.goto('/sales');
    offlineGate.blocking = false; // mock reachable again before the flush
    await context.setOffline(false);
    await expect(badge).toHaveAttribute('aria-label', SYNC_SAVED, { timeout: 20_000 });
    await expect(page.getByTestId('sales-saved-total')).toContainText(EXPECTED_SALE_TOTAL);
  });
});
