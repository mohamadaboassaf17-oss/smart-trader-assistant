import { expect, type Page, type Route } from '@playwright/test';

/**
 * Shared Supabase mock + auth bootstrap for E2E specs.
 *
 * GoTrue endpoints under `/api-mock/auth/v1/**` return deterministic
 * sessions (10-year tokens → no refresh attempts); every other api-mock
 * path is treated as PostgREST and answers 201 [].
 */

export const E2E_EMAIL = 'trader@example.com';
export const E2E_PASSWORD = 'secret123';

const TEN_YEARS_S = 10 * 365 * 24 * 60 * 60;
const USER_ID = '11111111-2222-3333-4444-555555555555';

function userPayload(): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: E2E_EMAIL,
    email_confirmed_at: nowIso,
    phone: '',
    confirmed_at: nowIso,
    last_sign_in_at: nowIso,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: nowIso,
    updated_at: nowIso,
  };
}

function sessionPayload(): Record<string, unknown> {
  return {
    access_token: 'mock.header.signature',
    token_type: 'bearer',
    expires_in: TEN_YEARS_S,
    expires_at: Math.floor(Date.now() / 1000) + TEN_YEARS_S,
    refresh_token: 'refresh-token-e2e',
    user: userPayload(),
  };
}

async function replySession(route: Route): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(sessionPayload()),
  });
}

export async function interceptSupabase(page: Page): Promise<void> {
  await page.route('**/api-mock/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());

    if (method === 'HEAD') {
      await route.fulfill({ status: 200 });
      return;
    }
    if (url.pathname.endsWith('/auth/v1/signup')) return void (await replySession(route));
    if (url.pathname.endsWith('/auth/v1/token')) return void (await replySession(route));
    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(userPayload()),
      });
      return;
    }
    if (url.pathname.endsWith('/auth/v1/logout')) {
      await route.fulfill({ status: 204 });
      return;
    }
    // PostgREST (profiles, sales, …)
    await route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
}

/**
 * Happy path bootstrap: unauthenticated → /auth → sign up → /onboarding →
 * pick Lebanon → land on '/'. Leaves the app signed-in and onboarded.
 */
export async function signUpAndOnboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/, { timeout: 15_000 });
  await page.getByTestId('auth-toggle-mode').click();
  await page.getByTestId('auth-email').fill(E2E_EMAIL);
  await page.getByTestId('auth-password').fill(E2E_PASSWORD);
  await page.getByTestId('auth-email-submit').click();

  await expect(page).toHaveURL(/\/onboarding/, { timeout: 15_000 });
  await page.getByTestId('ob-country-lb').click();
  await page.getByTestId('ob-confirm').click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'لوحة التحكم', level: 1 })).toBeVisible({
    timeout: 15_000,
  });
}
