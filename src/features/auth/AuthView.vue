<script setup lang="ts">
/**
 * <AuthView> — the three PRD §4.1 sign-in methods as Arabic tabs:
 * Google OAuth · email + password · phone + OTP.
 * Failures surface as Arabic toasts via `authErrors.*` keys.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { useAuth } from '@/composables/useAuth';
import { useToast } from '@/composables/useToast';

import type { AuthErrorKey } from '@/services/supabase/auth';

type Tab = 'google' | 'email' | 'phone';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const auth = useAuth();
const toast = useToast();

const tab = ref<Tab>('email');
const tabs: { id: Tab; labelKey: string }[] = [
  { id: 'google', labelKey: 'auth.tabGoogle' },
  { id: 'email', labelKey: 'auth.tabEmail' },
  { id: 'phone', labelKey: 'auth.tabPhone' },
];

const email = ref('');
const password = ref('');
const mode = ref<'signin' | 'signup'>('signin');
const phone = ref('');
const otpCode = ref('');
const otpSent = ref(false);

const busy = computed(() => auth.state.loading);
const emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()));
const canSubmitEmail = computed(
  () => emailValid.value && password.value.length >= 6 && !busy.value,
);

function showError(key: AuthErrorKey): void {
  const map: Record<AuthErrorKey, string> = {
    invalidCredentials: t('authErrors.invalidCredentials'),
    emailInUse: t('authErrors.emailInUse'),
    weakPassword: t('authErrors.weakPassword'),
    invalidOtp: t('authErrors.invalidOtp'),
    network: t('authErrors.network'),
    notConfigured: t('authErrors.notConfigured'),
    unknown: t('common.error'),
  };
  toast.error(map[key]);
}

function afterAuth(): void {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
  void router.push(redirect);
}

async function onGoogle(): Promise<void> {
  const result = await auth.google();
  if (!result.ok) showError(result.error);
  // Success redirects the whole page to Google.
}

async function onEmailSubmit(): Promise<void> {
  if (!canSubmitEmail.value) return;
  const result =
    mode.value === 'signin'
      ? await auth.signInEmail(email.value.trim(), password.value)
      : await auth.signUpEmail(email.value.trim(), password.value);
  if (!result.ok) {
    showError(result.error);
    return;
  }
  afterAuth();
}

async function onSendOtp(): Promise<void> {
  if (!phone.value.trim() || busy.value) return;
  const result = await auth.sendOtp(phone.value.trim());
  if (!result.ok) {
    showError(result.error);
    return;
  }
  otpSent.value = true;
  toast.info(t('auth.otpSent'));
}

async function onVerifyOtp(): Promise<void> {
  if (!otpCode.value.trim() || busy.value) return;
  const result = await auth.confirmOtp(phone.value.trim(), otpCode.value.trim());
  if (!result.ok) {
    showError(result.error);
    return;
  }
  afterAuth();
}
</script>

<template>
  <div class="auth">
    <header class="auth__brand" role="banner">
      <h1 class="auth__title">{{ t('app.name') }}</h1>
      <p class="auth__tagline">{{ t('app.tagline') }}</p>
    </header>

    <main class="auth__card">
      <div class="auth__tabs" role="tablist" :aria-label="t('auth.title')">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="auth__tab"
          :class="{ 'auth__tab--active': tab === item.id }"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          {{ t(item.labelKey) }}
        </button>
      </div>

      <!-- ── Google ─────────────────────────────────────────────────────── -->
      <section v-if="tab === 'google'" class="auth__panel">
        <p class="auth__hint">{{ t('auth.googleHint') }}</p>
        <button
          type="button"
          class="auth__submit"
          data-testid="auth-google"
          :disabled="busy"
          @click="onGoogle"
        >
          {{ t('auth.google') }}
        </button>
      </section>

      <!-- ── Email + password ──────────────────────────────────────────── -->
      <section v-else-if="tab === 'email'" class="auth__panel">
        <form class="auth__form" @submit.prevent="onEmailSubmit">
          <label class="auth__field">
            <span>{{ t('auth.emailLabel') }}</span>
            <input
              v-model="email"
              type="email"
              dir="ltr"
              autocomplete="email"
              required
              data-testid="auth-email"
              placeholder="name@example.com"
            />
          </label>
          <label class="auth__field">
            <span>{{ t('auth.passwordLabel') }}</span>
            <input
              v-model="password"
              type="password"
              dir="ltr"
              autocomplete="current-password"
              minlength="6"
              required
              data-testid="auth-password"
            />
          </label>
          <button
            type="submit"
            class="auth__submit"
            data-testid="auth-email-submit"
            :disabled="!canSubmitEmail"
          >
            {{ mode === 'signin' ? t('auth.signIn') : t('auth.signUp') }}
          </button>
          <button
            type="button"
            class="auth__link"
            data-testid="auth-toggle-mode"
            @click="mode = mode === 'signin' ? 'signup' : 'signin'"
          >
            {{ mode === 'signin' ? t('auth.switchToSignUp') : t('auth.switchToSignIn') }}
          </button>
        </form>
      </section>

      <!-- ── Phone + OTP ───────────────────────────────────────────────── -->
      <section v-else class="auth__panel">
        <form class="auth__form" @submit.prevent="otpSent ? onVerifyOtp() : onSendOtp()">
          <label class="auth__field">
            <span>{{ t('auth.phoneLabel') }}</span>
            <input
              v-model="phone"
              type="tel"
              dir="ltr"
              autocomplete="tel"
              required
              data-testid="auth-phone"
              placeholder="+961 …"
              :disabled="otpSent"
            />
          </label>
          <label v-if="otpSent" class="auth__field">
            <span>{{ t('auth.otpLabel') }}</span>
            <input
              v-model="otpCode"
              type="text"
              inputmode="numeric"
              dir="ltr"
              maxlength="6"
              required
              data-testid="auth-otp-code"
            />
          </label>
          <button
            type="submit"
            class="auth__submit"
            data-testid="auth-phone-submit"
            :disabled="busy || !phone.trim()"
          >
            {{ otpSent ? t('auth.verifyOtp') : t('auth.sendOtp') }}
          </button>
          <button v-if="otpSent" type="button" class="auth__link" @click="otpSent = false">
            {{ t('auth.changePhone') }}
          </button>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-4);
}

.auth__brand {
  text-align: center;
}

.auth__title {
  font-size: var(--font-size-2xl);
  color: var(--color-brand-700);
}

.auth__tagline {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.auth__card {
  width: 100%;
  max-width: var(--max-width);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-4);
}

.auth__tabs {
  display: flex;
  gap: var(--space-1);
  margin-block-end: var(--space-4);
  border-block-end: 1px solid var(--color-border);
}

.auth__tab {
  flex: 1;
  padding: var(--space-2) var(--space-1);
  min-block-size: var(--tap-target-min);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
  border-block-end: 2px solid transparent;
}

.auth__tab--active {
  color: var(--color-brand-700);
  border-block-end-color: var(--color-brand-700);
}

.auth__panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.auth__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-align: center;
}

.auth__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.auth__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.auth__field input {
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  text-align: start;
}

.auth__submit {
  min-block-size: calc(var(--tap-target-min) + 6px);
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  font-weight: 700;
  font-size: var(--font-size-base);
}

.auth__submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.auth__link {
  align-self: center;
  border: none;
  background: transparent;
  color: var(--color-brand-700);
  font-size: var(--font-size-sm);
}
</style>
