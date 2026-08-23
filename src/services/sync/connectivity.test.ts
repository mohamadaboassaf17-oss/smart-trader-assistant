import { afterEach, describe, expect, it, vi } from 'vitest';

import { heartbeat, isOnline, subscribeConnectivity } from './connectivity';

function setOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('isOnline', () => {
  it('reflects navigator.onLine', () => {
    setOnLine(true);
    expect(isOnline()).toBe(true);
    setOnLine(false);
    expect(isOnline()).toBe(false);
  });
});

describe('subscribeConnectivity', () => {
  afterEach(() => setOnLine(true));

  it('fires on browser online/offline events and unsubscribes', () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeConnectivity((online) => seen.push(online));

    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(seen).toEqual([false, true]);

    unsubscribe();
    window.dispatchEvent(new Event('offline'));
    expect(seen).toEqual([false, true]);
  });
});

describe('heartbeat', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves true on a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    await expect(heartbeat('https://x.supabase.co/rest/v1/')).resolves.toBe(true);
  });

  it('resolves false when the request throws (offline)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(heartbeat('https://x.supabase.co/rest/v1/')).resolves.toBe(false);
  });

  it('aborts after the timeout and resolves false', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    await expect(heartbeat('https://x.supabase.co/', 30)).resolves.toBe(false);
  });
});
