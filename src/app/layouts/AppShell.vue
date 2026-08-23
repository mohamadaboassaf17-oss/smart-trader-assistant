<script setup lang="ts">
import { computed, markRaw, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';

import SyncBadge from '@/components/SyncBadge.vue';
import DashboardView from '@/features/dashboard/DashboardView.vue';
import GoalsView from '@/features/goals/GoalsView.vue';
import InventoryView from '@/features/inventory/InventoryView.vue';
import NotesView from '@/features/notes/NotesView.vue';
import ObligationsView from '@/features/obligations/ObligationsView.vue';
import PurchasesView from '@/features/purchases/PurchasesView.vue';
import SalesView from '@/features/sales/SalesView.vue';
import SuppliersView from '@/features/suppliers/SuppliersView.vue';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const VIEW_BY_NAME: Record<string, Component> = markRaw({
  dashboard: DashboardView,
  sales: SalesView,
  purchases: PurchasesView,
  suppliers: SuppliersView,
  inventory: InventoryView,
  obligations: ObligationsView,
  notes: NotesView,
  goals: GoalsView,
});

const tabs = computed(() =>
  router
    .getRoutes()
    .filter((r) => r.meta?.showInNav && r.name)
    .map((r) => ({
      name: r.name as string,
      title: r.meta?.title as string,
      path: router.resolve({ name: r.name as string }).href,
    })),
);

const currentTitle = computed(() => (route.meta?.title as string | undefined) ?? t('app.name'));

const FeatureView = computed<Component | null>(() => {
  const name = route.name as string | undefined;
  if (!name) return null;
  return VIEW_BY_NAME[name] ?? null;
});
</script>

<template>
  <div class="shell">
    <header class="shell__header" role="banner">
      <h1 class="shell__title">{{ currentTitle }}</h1>
      <SyncBadge class="shell__sync" data-testid="sync-badge" />
    </header>

    <main class="shell__main" role="main">
      <component :is="FeatureView" v-if="FeatureView" />
    </main>

    <nav class="shell__nav" role="navigation" :aria-label="t('nav.home')">
      <router-link
        v-for="tab in tabs"
        :key="tab.name"
        :to="tab.path"
        class="shell__nav-link"
        active-class="shell__nav-link--active"
      >
        <span class="shell__nav-label">{{ tab.title }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100svh;
}

.shell__header {
  position: sticky;
  inset-block-start: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  block-size: var(--header-height);
  padding-inline: var(--space-4);
  background: var(--color-brand-700);
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-sm);
}

.shell__title {
  font-size: var(--font-size-lg);
  font-weight: 700;
  margin: 0;
  color: inherit;
}

.shell__sync {
  margin-inline-start: auto;
  min-block-size: auto;
}

.shell__main {
  flex: 1 1 auto;
  padding: var(--space-4);
  padding-block-end: calc(var(--header-height) + var(--space-4));
}

.shell__nav {
  position: fixed;
  inset-block-end: 0;
  inset-inline: 0;
  display: flex;
  background: var(--color-surface);
  border-block-start: 1px solid var(--color-border);
  box-shadow: 0 -1px 2px rgb(0 0 0 / 0.04);
  max-width: var(--max-width);
  margin-inline: auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.shell__nav::-webkit-scrollbar {
  display: none;
}

.shell__nav-link {
  flex: 1 1 0;
  min-block-size: var(--tap-target-min);
  display: flex;
  align-items: center;
  justify-content: center;
  padding-inline: var(--space-3);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: 500;
  text-decoration: none;
  border-block-start: 2px solid transparent;
  transition:
    color 120ms ease,
    border-color 120ms ease;
}

.shell__nav-link--active {
  color: var(--color-brand-700);
  border-block-start-color: var(--color-brand-700);
  background: var(--color-brand-50);
}

.shell__nav-label {
  text-align: center;
  white-space: nowrap;
}
</style>
