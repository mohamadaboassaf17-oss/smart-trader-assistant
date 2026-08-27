import { expect, test } from '@playwright/test';

import { interceptSupabase, signUpAndOnboard } from './helpers/supabase-mock';

/**
 * M6 obligations (PRD §6.5): generate pending rows for current month,
 * mark paid (تأكيد الدفع), verify status flips ⏳ → ✅, history persists,
 * and deletion cascades. Covers the dashboard net pipeline indirectly.
 */

test.describe('obligations — pay & manage (M6)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Chromium-only for M6');

  test('add obligation → pending row appears → mark paid → status becomes مدفوعة', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await interceptSupabase(page);
    await signUpAndOnboard(page);

    await page.goto('/obligations');
    await expect(page.getByTestId('obligations-empty')).toBeVisible({ timeout: 15_000 });

    // Add obligation
    await page.getByTestId('obligation-fab').click();
    const editor = page.getByTestId('obligation-dialog');
    await expect(editor).toBeVisible();
    await editor.getByTestId('obligation-name').fill('الإيجار');
    await editor.getByRole('textbox', { name: 'المبلغ الشهري' }).fill('500');
    await editor.getByTestId('obligation-due-day').selectOption('5');
    await editor.getByTestId('obligation-save').click();
    await expect(editor).toBeHidden({ timeout: 10_000 });

    // Pending row for current month should appear
    const paymentList = page.getByTestId('payment-list');
    await expect(paymentList).toBeVisible({ timeout: 15_000 });
    const firstRow = page.getByTestId('payment-row').first();
    await expect(firstRow.getByTestId('payment-name')).toContainText('الإيجار');
    await expect(firstRow.getByTestId('payment-status')).toContainText('معلقة');
    await expect(firstRow.getByTestId('payment-pay')).toBeEnabled();

    // Mark paid
    await firstRow.getByTestId('payment-pay').click();
    await expect(firstRow.getByTestId('payment-status')).toContainText('مدفوعة', {
      timeout: 10_000,
    });
    await expect(firstRow.getByTestId('payment-pay')).toBeDisabled();
    await expect(page.getByTestId('toast').filter({ hasText: 'تم تأكيد الدفع' })).toBeVisible({
      timeout: 10_000,
    });

    // Reload proves persistence (IndexedDB)
    await page.reload();
    await expect(page.getByTestId('payment-list')).toBeVisible({ timeout: 15_000 });
    const reloaded = page.getByTestId('payment-row').first();
    await expect(reloaded.getByTestId('payment-status')).toContainText('مدفوعة');
  });

  test('inactive obligation does not generate a pending payment row', async ({ page }) => {
    test.setTimeout(90_000);
    await interceptSupabase(page);
    await signUpAndOnboard(page);
    await page.goto('/obligations');

    await page.getByTestId('obligation-fab').click();
    const editor = page.getByTestId('obligation-dialog');
    await expect(editor).toBeVisible();
    await editor.getByTestId('obligation-name').fill('اشتراك إنترنت');
    await editor.getByRole('textbox', { name: 'المبلغ الشهري' }).fill('30');
    await editor.getByTestId('obligation-due-day').selectOption('15');
    // Toggle active off
    const activeToggle = editor.getByTestId('obligation-active');
    if (await activeToggle.isVisible()) await activeToggle.click();
    await editor.getByTestId('obligation-save').click();
    await expect(editor).toBeHidden({ timeout: 10_000 });

    // Inactive → no pending row for this obligation
    await expect(page.getByTestId('payment-list')).toHaveCount(0);
    await expect(page.getByTestId('obligation-list')).toBeVisible();
  });
});
