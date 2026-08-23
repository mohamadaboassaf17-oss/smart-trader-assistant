import { createPinia } from 'pinia';
import { createApp } from 'vue';

import { i18n } from '@/app/i18n';
import { router } from '@/app/router';
import { initOfflineSync } from '@/composables/useOfflineSync';

import App from './App.vue';
import './style.css';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(i18n);

initOfflineSync();

app.mount('#app');
