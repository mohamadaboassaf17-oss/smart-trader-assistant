<script setup lang="ts">
/**
 * <RenewalView> — renewal screen (PRD §4.3–§4.5 + M8 Stripe).
 *
 * Dual-track in M8 (VITE_PAYMENT_MODE=dual default):
 *   - Stripe Checkout (Visa) — instant activation via webhook.
 *   - Manual Whish/OMT — founder activates via Supabase (Beta runbook).
 *
 * The lock itself lives in useSubscription + router guard; this view is the
 * destination, not the enforcer. Offline devices keep full access until a
 * successful online sync proves expiry.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import { useAuth } from '@/composables/useAuth';
import { formatDayLabel, toIsoDate } from '@/composables/useDayFormat';
import { useToast } from '@/composables/useToast';
import { CONTACT, mailtoUrl, whatsappUrl } from '@/config/contact';
import {
  APP_URL,
  isStripeConfigured,
  showManual,
  showStripe,
  STRIPE_PRICE_ID,
} from '@/config/payment';
import { createCheckoutSession, createPortalSession } from '@/services/stripe/stripe';
import { subscriptionState } from '@/utils/subscription';

import type { SubscriptionState } from '@/utils/subscription';

const { t } = useI18n();
const auth = useAuth();
const toast = useToast();
// useRoute/useRouter require a router instance — tests mount without one.
// Fall back to a stub so the view still renders and the success/canceled
// toast logic is simply skipped in that environment.
let route: ReturnType<typeof useRoute> | { query: Record<string, string | undefined> };
let router: ReturnType<typeof useRouter> | { replace: (opts: unknown) => Promise<void> };
try {
  const r = useRoute() as unknown as ReturnType<typeof useRoute> | undefined;
  route =
    r && (r as unknown as { query?: unknown }).query !== undefined
      ? r
      : ({ query: {} } as unknown as ReturnType<typeof useRoute>);
} catch {
  route = { query: {} } as unknown as ReturnType<typeof useRoute>;
}
try {
  const r = useRouter() as unknown as ReturnType<typeof useRouter> | undefined;
  router =
    r && typeof (r as unknown as { replace?: unknown }).replace === 'function'
      ? r
      : ({ replace: () => Promise.resolve() } as unknown as ReturnType<typeof useRouter>);
} catch {
  router = { replace: () => Promise.resolve() } as unknown as ReturnType<typeof useRouter>;
}

const state = computed<SubscriptionState>(() => subscriptionState(auth.state.profile));

/** ISO day (`YYYY-MM-DD`) of expiry, or null when absent/unparseable. */
const expiresDay = computed<string | null>(() => {
  const expiresAt = auth.state.profile?.subscriptionExpiresAt;
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return toIsoDate(date);
});

const daysRemaining = computed<number>(() => {
  if (state.value !== 'trial' || !expiresDay.value) return 0;
  const expiresAt = auth.state.profile?.subscriptionExpiresAt ?? '';
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
});

const statusText = computed<string>(() => {
  switch (state.value) {
    case 'active':
      return expiresDay.value
        ? t('subscription.expiresOn', { date: formatDayLabel(expiresDay.value) })
        : t('subscription.statusActive');
    case 'trial':
      return `${t('subscription.statusTrial')} · ${t('subscription.daysRemaining', {
        days: daysRemaining.value,
      })}`;
    default:
      return t('subscription.statusExpired');
  }
});

const statusClass = computed<Record<string, boolean>>(() => ({
  'renewal__status--ok': state.value === 'active',
  'renewal__status--warn': state.value === 'trial',
  'renewal__status--bad': state.value === 'expired' || state.value === 'none',
}));

const showExpiredHint = computed<boolean>(
  () => state.value === 'expired' || state.value === 'none',
);

const waHref = computed<string>(() => whatsappUrl(t('subscription.waPrefill')));
const mailHref = computed<string>(() => mailtoUrl(t('subscription.emailSubject')));

// ── M8: Stripe state ─────────────────────────────────────────────────────
const stripeLoading = ref(false);
const portalLoading = ref(false);
const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);

const stripeConfigured = computed<boolean>(() => isStripeConfigured());
const hasStripeCustomer = computed<boolean>(() => Boolean(auth.state.profile?.stripeCustomerId));
const canShowStripeSection = computed<boolean>(() => showStripe);
const canShowManualSection = computed<boolean>(() => showManual);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (isOnline.value = true));
  window.addEventListener('offline', () => (isOnline.value = false));
}

async function onPayWithStripe(): Promise<void> {
  if (!isOnline.value) {
    toast.error(t('subscription.stripeOffline'));
    return;
  }
  if (!stripeConfigured.value) {
    toast.error(t('subscription.stripeNotConfigured'));
    console.error(
      '[renewal] Stripe not configured — missing VITE_STRIPE_PUBLISHABLE_KEY / VITE_STRIPE_PRICE_ID',
    );
    return;
  }
  stripeLoading.value = true;
  try {
    const successUrl = `${APP_URL}/subscription?success=1`;
    const cancelUrl = `${APP_URL}/subscription?canceled=1`;
    const result = await createCheckoutSession({
      priceId: STRIPE_PRICE_ID || undefined,
      successUrl,
      cancelUrl,
    });
    if (!result.ok) {
      console.error('[renewal] createCheckoutSession failed', result.error);
      toast.error(result.error || t('subscription.stripeError'));
      return;
    }
    window.location.href = result.value.url;
  } catch (error) {
    console.error('[renewal] checkout exception', error);
    toast.error(t('subscription.stripeError'));
  } finally {
    stripeLoading.value = false;
  }
}

async function onManageBilling(): Promise<void> {
  if (!isOnline.value) {
    toast.error(t('subscription.stripeOffline'));
    return;
  }
  if (!hasStripeCustomer.value) {
    toast.error(t('subscription.noStripeCustomer'));
    return;
  }
  portalLoading.value = true;
  try {
    const result = await createPortalSession({ returnUrl: `${APP_URL}/subscription` });
    if (!result.ok) {
      console.error('[renewal] createPortalSession failed', result.error);
      toast.error(result.error || t('subscription.portalError'));
      return;
    }
    window.location.href = result.value.url;
  } catch (error) {
    console.error('[renewal] portal exception', error);
    toast.error(t('subscription.portalError'));
  } finally {
    portalLoading.value = false;
  }
}

async function onSignOut(): Promise<void> {
  await auth.signOut();
}

onMounted(() => {
  const q = route.query as Record<string, string | undefined>;
  if (q['success'] === '1') {
    toast.success(t('subscription.successToast'));
    // Clean query so refresh doesn't re-toast; keep other params.
    void router.replace({ query: { ...q, success: undefined, canceled: undefined } });
  } else if (q['canceled'] === '1') {
    toast.info(t('subscription.canceledToast'));
    void router.replace({ query: { ...q, success: undefined, canceled: undefined } });
  }
});
</script>

<template>
  <div class="renewal">
    <header class="renewal__header" role="banner">
      <h1 class="renewal__title" data-testid="renewal-title">
        {{ t('subscription.renewTitle') }}
      </h1>
      <p class="renewal__tagline">{{ t('app.tagline') }}</p>
    </header>

    <main class="renewal__card">
      <section class="renewal__status" :class="statusClass" data-testid="renewal-status">
        <p class="renewal__price" data-testid="renewal-price">{{ t('subscription.planPrice') }}</p>
        <p class="renewal__state">{{ statusText }}</p>
        <p v-if="showExpiredHint" class="renewal__hint">
          {{ t('subscription.expiredHint') }}
        </p>
      </section>

      <!-- ── M8: Stripe Checkout ────────────────────────────────────── -->
      <section
        v-if="canShowStripeSection"
        class="renewal__stripe"
        :aria-label="t('subscription.stripeTitle')"
        data-testid="renewal-stripe"
      >
        <h2 class="renewal__subtitle">{{ t('subscription.stripeTitle') }}</h2>
        <p class="renewal__hint">{{ t('subscription.stripeHint') }}</p>

        <button
          type="button"
          class="renewal__cta renewal__cta--stripe"
          data-testid="cta-stripe"
          :disabled="stripeLoading || !isOnline"
          :aria-busy="stripeLoading ? 'true' : 'false'"
          @click="onPayWithStripe"
        >
          <span v-if="stripeLoading">{{ t('subscription.stripeLoading') }}</span>
          <span v-else-if="!isOnline">{{ t('subscription.stripeOffline') }}</span>
          <span v-else>{{ t('subscription.payWithStripe') }}</span>
        </button>
        <p
          v-if="!stripeConfigured"
          class="renewal__hint renewal__hint--warn"
          data-testid="stripe-not-configured"
        >
          {{ t('subscription.stripeNotConfigured') }}
        </p>
        <p v-if="!isOnline" class="renewal__hint" data-testid="stripe-offline-hint">
          {{ t('subscription.stripeOffline') }}
        </p>
      </section>

      <!-- ── M8: Stripe Customer Portal (only when linked) ──────────── -->
      <section
        v-if="canShowStripeSection && hasStripeCustomer"
        class="renewal__portal"
        :aria-label="t('subscription.manageTitle')"
        data-testid="renewal-portal"
      >
        <h2 class="renewal__subtitle">{{ t('subscription.manageTitle') }}</h2>
        <p class="renewal__hint">{{ t('subscription.manageHint') }}</p>
        <button
          type="button"
          class="renewal__cta renewal__cta--secondary"
          data-testid="cta-portal"
          :disabled="portalLoading || !isOnline"
          :aria-busy="portalLoading ? 'true' : 'false'"
          @click="onManageBilling"
        >
          <span v-if="portalLoading">{{ t('subscription.portalLoading') }}</span>
          <span v-else>{{ t('subscription.manageBilling') }}</span>
        </button>
      </section>

      <!-- ── Manual Whish/OMT (gated by PAYMENT_MODE) ────────────────── -->
      <section
        v-if="canShowManualSection"
        class="renewal__instructions"
        :aria-label="t('subscription.instructionTitle')"
        data-testid="renewal-manual"
      >
        <h2 class="renewal__subtitle">
          {{
            canShowStripeSection
              ? t('subscription.manualTitle')
              : t('subscription.instructionTitle')
          }}
        </h2>
        <ol class="renewal__steps">
          <li class="renewal__step">{{ t('subscription.payStep') }}</li>
          <li class="renewal__step" data-testid="renewal-whish">
            {{ t('subscription.whishLine') }}
            <span dir="ltr" class="renewal__number">{{ CONTACT.whishNumber }}</span>
          </li>
          <li class="renewal__step" data-testid="renewal-omt">
            {{ t('subscription.omtLine') }}
            <span dir="ltr" class="renewal__number">{{ CONTACT.omtNumber }}</span>
          </li>
          <li class="renewal__step">{{ t('subscription.sendStep') }}</li>
        </ol>

        <div class="renewal__ctas">
          <a
            :href="waHref"
            target="_blank"
            rel="noopener"
            class="renewal__cta"
            data-testid="cta-whatsapp"
          >
            {{ t('subscription.whatsappLabel') }}
          </a>
          <a :href="mailHref" class="renewal__cta renewal__cta--secondary" data-testid="cta-email">
            {{ t('subscription.emailLabel') }}
          </a>
        </div>
      </section>

      <button type="button" class="renewal__signout" data-testid="signout" @click="onSignOut">
        {{ t('subscription.signOut') }}
      </button>
    </main>
  </div>
</template>

<style scoped>
.renewal {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-4);
}

.renewal__header {
  text-align: center;
}

.renewal__title {
  font-size: var(--font-size-2xl);
  color: var(--color-brand-700);
}

.renewal__tagline {
  margin-block-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.renewal__card {
  width: 100%;
  max-width: var(--max-width);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-4);
}

.renewal__status {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.renewal__price {
  font-weight: 700;
  font-size: var(--font-size-base);
  color: var(--color-text);
}

.renewal__state {
  font-size: var(--font-size-sm);
}

.renewal__status--ok .renewal__state {
  color: var(--color-success);
}

.renewal__status--warn .renewal__state {
  color: var(--color-warning);
}

.renewal__status--bad .renewal__state {
  color: var(--color-danger);
}

.renewal__hint {
  margin-block-start: var(--space-1);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.renewal__hint--warn {
  color: var(--color-warning);
}

.renewal__stripe,
.renewal__portal {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  background: var(--color-surface-2);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
}

.renewal__subtitle {
  margin-block-end: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--color-text);
}

.renewal__steps {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-inline-start: var(--space-4);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.renewal__number {
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.renewal__ctas {
  display: grid;
  gap: var(--space-2);
  margin-block-start: var(--space-3);
}

.renewal__cta {
  min-block-size: var(--tap-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-brand-700);
  border-radius: var(--radius-md);
  color: var(--color-text-inverse);
  font-weight: 700;
  text-decoration: none;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-sm);
}

.renewal__cta--stripe {
  background: var(--color-brand-700);
}

.renewal__cta:disabled {
  opacity: 0.6;
  cursor: wait;
}

.renewal__cta--secondary {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  color: var(--color-brand-700);
}

.renewal__signout {
  align-self: center;
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-3);
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  cursor: pointer;
}
</style>
