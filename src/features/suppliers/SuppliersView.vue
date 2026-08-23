<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <section class="placeholder">
    <h2>{{ t('suppliers.title') }}</h2>
    <p class="placeholder__hint">قائمة الموردين والديون — قادمة في M5.</p>
  </section>
</template>

<style scoped>
.placeholder {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.placeholder__hint {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
