<script setup lang="ts">
/**
 * <AppToaster> — renders the singleton toast queue (AR, RTL-aware).
 * `role="status"` + `aria-live="polite"` so screen readers announce toasts.
 */
import { useToast } from '@/composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div class="toaster" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.kind}`"
        data-testid="toast"
      >
        <span class="toast__icon" aria-hidden="true">
          {{ toast.kind === 'success' ? '✅' : toast.kind === 'error' ? '❌' : 'ℹ️' }}
        </span>
        <p class="toast__message">{{ toast.message }}</p>
        <button type="button" class="toast__close" aria-label="إغلاق" @click="dismiss(toast.id)">
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toaster {
  position: fixed;
  inset-block-start: calc(var(--header-height) + var(--space-2));
  inset-inline: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding-inline: var(--space-4);
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: var(--max-width);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-md);
}

.toast--success {
  border-inline-start: 4px solid var(--color-success);
}

.toast--error {
  border-inline-start: 4px solid var(--color-danger);
}

.toast--info {
  border-inline-start: 4px solid var(--color-info);
}

.toast__message {
  flex: 1 1 auto;
  font-size: var(--font-size-sm);
}

.toast__close {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--font-size-lg);
  line-height: 1;
  padding: var(--space-1);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
