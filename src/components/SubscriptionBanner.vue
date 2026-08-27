<script setup lang="ts">
/**
 * <SubscriptionBanner> — slim grace-period reminder bar (PRD §4.4).
 *
 * Mounted under the AppShell header; visible only while the subscription is
 * still usable AND within GRACE_DAYS of expiry. Purely informational and
 * never blocks the UI (offline-first, PRD §4.5).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { useSubscription } from '@/composables/useSubscription';
import { daysUntilExpiry } from '@/utils/subscription';

const { t } = useI18n();
const { state } = useSubscription();

const days = computed<number | null>(() => {
  if (state.expiresAt === null) return null;
  const value = daysUntilExpiry(state.expiresAt);
  return value !== null && value >= 0 ? value : null;
});
</script>

<template>
  <div
    v-if="state.graceBannerVisible && days !== null"
    class="banner"
    role="status"
    aria-live="polite"
    data-testid="subscription-banner"
  >
    <span class="banner__text">{{ t('subscription.graceBanner', { days }) }}</span>
    <router-link to="/subscription" class="banner__link">
      {{ t('subscription.renewNow') }}
    </router-link>
  </div>
</template>

<style scoped>
.banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface-2);
  border-block-start: 1px solid var(--color-border);
  border-block-end: 1px solid var(--color-border);
  border-inline-start: 4px solid var(--color-warning);
  color: var(--color-text);
  font-size: var(--font-size-sm);
}

.banner__text {
  font-weight: 500;
}

.banner__link {
  color: var(--color-brand-700);
  font-weight: 700;
  text-decoration: underline;
}
</style>
