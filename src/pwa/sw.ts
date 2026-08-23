/**
 * Custom service worker (Workbox, injected by vite-plugin-pwa).
 *
 * - Precaches the app shell (hashed build output) so cold offline opens work.
 * - Runtime-caches images/fonts (CacheFirst) and same-origin assets.
 * - Queues failed API mutations via Background Sync as a *second* safety
 *   net: upserts are idempotent on UUID `id`, so a duplicate replay from the
 *   SW queue plus the app-level IndexedDB sync queue is harmless.
 */

/// <reference lib="webworker" />

import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// App-shell navigation fallback — SPA routes resolve to the precached index.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Static assets not covered by the precache manifest (e.g. runtime imports).
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'runtime-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

// Failed Supabase mutations → Background Sync queue (Chromium+).
const mutationQueue = new BackgroundSyncPlugin('trader-mutations', {
  // Retention is in minutes: keep failed mutations for up to 7 days.
  maxRetentionTime: 7 * 24 * 60,
});
registerRoute(
  /\/rest\/v1\//,
  new CacheFirst({
    cacheName: 'api-mutations',
    plugins: [mutationQueue],
  }),
  'POST',
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') self.skipWaiting();
});

clientsClaim();
