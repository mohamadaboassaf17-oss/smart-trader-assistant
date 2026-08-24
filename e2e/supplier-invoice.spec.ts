import { expect, test, type Locator, type Page } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * M5 acceptance flows (PRD §6.3):
 *   1. Happy path — add supplier → goods invoice (total 1000, paid 400)
 *      → derived outstanding balance $600.00 on the list badge AND the
 *      drill-in detail, with the invoice row in the history.
 *   2. Offline variant — supplier + invoice queued locally ⏳ while the
 *      network is cut, durable across an offline reload, flushed ✅ once
 *      back online (same route-gate discipline as daily-entry-offline).
 *   3. Overpay guard — paid > total keeps save disabled and surfaces the
 *      Arabic error; correcting the amount lifts the guard.
 *   4. Delete guard — deleting a supplier that has invoices is refused
 *      with the Arabic deleteBlocked toast and the row survives.
 */

const SYNC_PENDING = 'في انتظار الإنترنت';
const SYNC_SAVED = 'تم الحفظ';

const SUPPLIER_NAME = 'محمود الأثاث';
const SUPPLIER_PHONE_TYPED = '+961 71 234567';
const SUPPLIER_PHONE_NORMALIZED = '+96171234567';

const INVOICE_TOTAL_TEXT = '1000';
const INVOICE_PAID_TEXT = '400';

/** Mirrors `formatMoney(cents, 'USD')` (en-US currency style). */
function usd(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

const EXPECTED_BALANCE = usd(600_00); // 1000 − 400
const OVERPAY_ERROR = 'المدفوع لا يتجاوز الإجمالي';
const DELETE_BLOCKED = 'تعذّر الحذف — توجد فواتير مرتبطة بهذا المورد';

function supplierRow(page: Page, name: string): Locator {
  return page.getByTestId('suppliers-list').getByTestId('supplier-row').filter({ hasText: name });
}

function totalField(scope: Locator): Locator {
  return scope.getByRole('textbox', { name: 'إجمالي الفاتورة ($)' });
}

function paidField(scope: Locator): Locator {
  return scope.getByRole('textbox', { name: 'المدفوع نقداً ($)' });
}

async function addSupplierViaDialog(page: Page, name: string, phone: string): Promise<void> {
  await page.getByTestId('supplier-fab').click();
  const dialog = page.getByTestId('supplier-dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByTestId('supplier-name').fill(name);
  if (phone !== '') await dialog.getByTestId('supplier-phone').fill(phone);
  await dialog.getByTestId('supplier-save').click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

async function openInvoiceDialog(page: Page): Promise<Locator> {
  await page.getByTestId('supplier-add-invoice').click();
  const dialog = page.getByTestId('invoice-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Toasts auto-dismiss (success 3s / error 6s) and float over the top of the
 * screen — wait them out before clicking row controls underneath.
 */
async function toastsCleared(page: Page): Promise<void> {
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 10_000 });
}

test.describe('M5 suppliers & goods invoices', () => {
  // Mocked GoTrue + service-worker/offline emulation are validated on
  // Chromium only (same policy as the other auth-dependent specs);
  // cross-browser hardening lands in M7.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M5');

  test('happy path: supplier + $1000/$400 invoice derive a $600 outstanding balance', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/suppliers');
    await expect(page.getByTestId('suppliers-empty')).toBeVisible();

    // Add a supplier with a valid Lebanese mobile; the stored/displayed
    // form is the normalized E.164 value (+961…).
    await addSupplierViaDialog(page, SUPPLIER_NAME, SUPPLIER_PHONE_TYPED);
    const row = supplierRow(page, SUPPLIER_NAME);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('supplier-name-cell')).toHaveText(SUPPLIER_NAME);
    await expect(row.getByTestId('supplier-phone-cell')).toHaveText(SUPPLIER_PHONE_NORMALIZED);
    await expect(row.getByTestId('supplier-balance-badge')).toHaveText(usd(0));

    // Drill into the in-view detail panel (no extra route). Clicking the
    // name cell rather than the card: the card's vertical center can fall
    // inside the @click.stop action strip, swallowing the selection.
    await toastsCleared(page);
    await row.getByTestId('supplier-name-cell').click();
    const detail = page.getByTestId('supplier-detail');
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId('invoices-empty')).toBeVisible();

    // Goods invoice: total 1000, cash paid 400 → debt preview $600.00.
    const dialog = await openInvoiceDialog(page);
    await totalField(dialog).fill(INVOICE_TOTAL_TEXT);
    await paidField(dialog).fill(INVOICE_PAID_TEXT);
    await expect(dialog.getByTestId('invoice-debt-preview')).toContainText(EXPECTED_BALANCE);
    await dialog.getByTestId('invoice-save').click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // The balance is DERIVED live — the header updates without a reload.
    await expect(detail.getByTestId('supplier-balance')).toHaveText(EXPECTED_BALANCE, {
      timeout: 10_000,
    });

    // History shows the newest invoice with its total/paid/debt cells.
    const invoiceRow = detail.getByTestId('invoice-row');
    await expect(invoiceRow).toBeVisible();
    await expect(invoiceRow).toContainText(usd(1_000_00));
    await expect(invoiceRow).toContainText(usd(400_00));
    await expect(invoiceRow).toContainText(EXPECTED_BALANCE);

    // Back on the list, the badge carries the same derived balance.
    await toastsCleared(page);
    await page.getByTestId('supplier-back').click();
    await expect(row.getByTestId('supplier-balance-badge')).toHaveText(EXPECTED_BALANCE);
  });

  test('supplier + invoice entered offline queue ⏳, survive reload, sync ✅ online', async ({
    page,
    context,
  }) => {
    // Offline entry + SW warmup + reload durability + queue flush — far
    // beyond the 30s default.
    test.setTimeout(180_000);

    await interceptSupabase(page);

    // Route-level offline gate (same rationale as daily-entry-offline.spec):
    // Playwright's context.setOffline() alone does NOT stop route-intercepted
    // requests, so this handler runs FIRST and aborts while "offline".
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

    await page.goto('/suppliers');

    // Optimistic supplier save → row stored locally, op queued → ⏳.
    await addSupplierViaDialog(page, SUPPLIER_NAME, SUPPLIER_PHONE_TYPED);
    const row = supplierRow(page, SUPPLIER_NAME);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('supplier-balance-badge')).toHaveText(usd(0));
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 10_000 });

    // Invoice for the same supplier, still offline.
    await toastsCleared(page);
    await row.getByTestId('supplier-name-cell').click();
    const dialog = await openInvoiceDialog(page);
    await totalField(dialog).fill(INVOICE_TOTAL_TEXT);
    await paidField(dialog).fill(INVOICE_PAID_TEXT);
    await expect(dialog.getByTestId('invoice-debt-preview')).toContainText(EXPECTED_BALANCE);
    await dialog.getByTestId('invoice-save').click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByTestId('supplier-detail').getByTestId('invoice-row')).toBeVisible({
      timeout: 10_000,
    });
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 10_000 });

    // ── Still offline: reload proves IndexedDB-first durability ──────────
    await page.reload();
    await expect(page.getByTestId('supplier-fab')).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveAttribute('aria-label', SYNC_PENDING, { timeout: 15_000 });
    const reloadedRow = supplierRow(page, SUPPLIER_NAME);
    await expect(reloadedRow).toBeVisible({ timeout: 15_000 });
    await expect(reloadedRow.getByTestId('supplier-balance-badge')).toHaveText(EXPECTED_BALANCE);

    // ── Back online: queue flushes → ✅, data unchanged ──────────────────
    offlineGate.blocking = false; // mock reachable again before the flush
    await context.setOffline(false);
    await expect(badge).toHaveAttribute('aria-label', SYNC_SAVED, { timeout: 20_000 });
    await expect(reloadedRow.getByTestId('supplier-balance-badge')).toHaveText(EXPECTED_BALANCE);

    // Final online reload confirms both rows persist post-flush.
    await page.reload();
    await expect(supplierRow(page, SUPPLIER_NAME)).toBeVisible({ timeout: 15_000 });
    await expect(supplierRow(page, SUPPLIER_NAME).getByTestId('supplier-balance-badge')).toHaveText(
      EXPECTED_BALANCE,
    );
    await expect(page.getByTestId('sync-badge')).toHaveAttribute('aria-label', SYNC_SAVED, {
      timeout: 15_000,
    });
  });

  test('overpaying keeps save disabled and surfaces the Arabic overpay error', async ({ page }) => {
    test.setTimeout(90_000);

    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/suppliers');
    await addSupplierViaDialog(page, 'سمير للخضار', '');
    await toastsCleared(page);
    await supplierRow(page, 'سمير للخضار').getByTestId('supplier-name-cell').click();

    const dialog = await openInvoiceDialog(page);
    await totalField(dialog).fill('100');
    await paidField(dialog).fill('150');

    // Guard #1 — inline Arabic error replaces the debt preview.
    await expect(dialog.getByTestId('invoice-overpay')).toContainText(OVERPAY_ERROR);
    // Guard #2 — save stays disabled while paid > total.
    await expect(dialog.getByTestId('invoice-save')).toBeDisabled();

    // Correcting the paid amount lifts both guards live.
    await paidField(dialog).fill('40');
    await expect(dialog.getByTestId('invoice-overpay')).toBeHidden();
    await expect(dialog.getByTestId('invoice-debt-preview')).toContainText(usd(60_00));
    await expect(dialog.getByTestId('invoice-save')).toBeEnabled();
  });

  test('deleting a supplier that has invoices is blocked with an Arabic toast', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/suppliers');
    await addSupplierViaDialog(page, 'فاطمة للبضائع', '');

    // Give the supplier one invoice so the delete guard applies.
    await toastsCleared(page);
    await supplierRow(page, 'فاطمة للبضائع').getByTestId('supplier-name-cell').click();
    const dialog = await openInvoiceDialog(page);
    await totalField(dialog).fill('250');
    await paidField(dialog).fill('50');
    await dialog.getByTestId('invoice-save').click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // Two-step delete from the list view. NOTE: the confirm UI REPLACES the
    // card's name/actions markup, so from here on the row must be located
    // WITHOUT the name filter (a name-filtered locator stops resolving).
    await toastsCleared(page);
    await page.goto('/suppliers');
    const list = page.getByTestId('suppliers-list');
    const anyRow = list.getByTestId('supplier-row');
    await expect(anyRow.filter({ hasText: 'فاطمة للبضائع' })).toBeVisible();
    await anyRow.getByTestId('supplier-delete').click();
    await expect(list.getByTestId('supplier-confirm-delete')).toBeVisible();
    await list.getByTestId('supplier-confirm-delete').click();

    // Refused: Arabic deleteBlocked toast; confirm UI stays put.
    await expect(page.getByTestId('toast').filter({ hasText: DELETE_BLOCKED })).toBeVisible({
      timeout: 10_000,
    });
    await expect(list.getByTestId('supplier-confirm-delete')).toBeVisible();

    // Cancelling restores the untouched card with its derived balance.
    await list.getByTestId('supplier-cancel-delete').click();
    const row = anyRow.filter({ hasText: 'فاطمة للبضائع' });
    await expect(row).toBeVisible();
    await expect(row.getByTestId('supplier-balance-badge')).toHaveText(usd(200_00));
  });
});
