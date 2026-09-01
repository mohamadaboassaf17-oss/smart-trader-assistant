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
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: unknown[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// App-shell navigation fallback — SPA routes resolve to the precached index.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Static assets not covered by the precache manifest (e.g. runtime imports).
// Same-origin only: prevents cross-origin image/font cache pollution.
registerRoute(
  ({ request, url }) =>
    url.origin === self.location.origin &&
    (request.destination === 'image' || request.destination === 'font'),
  new CacheFirst({
    cacheName: 'runtime-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

// Supabase GET → NetworkFirst with 3s timeout for offline grace.
// Short cache (5 min / 30 entries) avoids serving stale reads while allowing
// recent GETs to resolve offline. Dexie remains primary source-of-truth;
// this is a fallback for direct fetch consumers when offline.
registerRoute(
  ({ url }) => url.pathname.startsWith('/rest/v1/') && url.origin === self.location.origin,
  new NetworkFirst({
    cacheName: 'supabase-get',
    networkTimeoutSeconds: 3,
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 5 * 60 })],
  }),
  'GET',
);

// Failed Supabase mutations → Background Sync queue (Chromium+).
// NetworkOnly is correct here: CacheFirst would cache failed POSTs and
// mask network errors. BackgroundSyncPlugin replays only when online.
const mutationQueue = new BackgroundSyncPlugin('trader-mutations', {
  // Retention is in minutes: keep failed mutations for up to 7 days.
  maxRetentionTime: 7 * 24 * 60,
});
registerRoute(
  /\/rest\/v1\//,
  new NetworkOnly({
    plugins: [mutationQueue],
  }),
  'POST',
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') self.skipWaiting();
});

clientsClaim();
