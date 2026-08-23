<script setup lang="ts">
import { onMounted } from 'vue';

import { applyDocumentLocale, DEFAULT_LOCALE } from '@/app/i18n';
import AppToaster from '@/components/AppToaster.vue';

onMounted(() => {
  applyDocumentLocale(DEFAULT_LOCALE);
});
</script>

<template>
  <router-view />
  <AppToaster />
</template>
