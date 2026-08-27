<script setup lang="ts">
/**
 * HomeView — public landing at `/` (M8).
 *
 * Authenticated users are redirected to `/dashboard` by the router guard
 * (`src/app/router/index.ts` — home→dashboard), so this view only renders
 * for unauthenticated visitors (or during the brief auth-hydration window).
 */
import LandingView from '@/features/landing/LandingView.vue';
</script>

<template>
  <LandingView />
</template>
