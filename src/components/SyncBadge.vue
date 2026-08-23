<script setup lang="ts">
/**
 * SyncBadge — ⏳ pending / ✅ saved / ❌ failed (PRD §7.1).
 *
 * Reads the offline-sync singleton state; ❌ only appears when queue items
 * exhausted their retries (dead letters). Transient failures stay ⏳.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

import { offlineSyncState, useOfflineSync } from '@/composables/useOfflineSync';

const { t } = useI18n();
useOfflineSync(); // ensure counters refresh helpers exist (state is module-scope)

type Variant = 'pending' | 'saved' | 'failed';

const variant = computed<Variant>(() => {
  if (offlineSyncState.deadCount.value > 0) return 'failed';
  if (offlineSyncState.pendingCount.value > 0) return 'pending';
  return 'saved';
});

const icon = computed(() => {
  switch (variant.value) {
    case 'pending':
      return '⏳';
    case 'failed':
      return '❌';
    default:
      return '✅';
  }
});

const ariaLabel = computed(() => t(`sync.${variant.value}`));
</script>

<template>
  <span
    class="sync-badge"
    :class="`sync-badge--${variant}`"
    role="status"
    :aria-label="ariaLabel"
    :title="ariaLabel"
  >
    <span aria-hidden="true">{{ icon }}</span>
  </span>
</template>

<style scoped>
.sync-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-inline-size: var(--tap-target-min);
  min-block-size: var(--tap-target-min);
  padding-inline: var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--font-size-base);
  line-height: 1;
}

.sync-badge--pending {
  background: rgb(217 119 6 / 0.12);
}

.sync-badge--saved {
  background: rgb(22 163 74 / 0.12);
}

.sync-badge--failed {
  background: rgb(220 38 38 / 0.14);
}
</style>
