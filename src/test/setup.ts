/**
 * Vitest global setup.
 * - fake-indexeddb: jsdom has no IndexedDB; this polyfill backs Dexie in tests.
 */

import 'fake-indexeddb/auto';
