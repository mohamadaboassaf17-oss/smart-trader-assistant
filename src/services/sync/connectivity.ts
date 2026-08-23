/**
 * Connectivity detection (M2).
 *
 * `navigator.onLine` is the cheap first signal; a heartbeat to the Supabase
 * REST root disambiguates captive portals / dead Wi-Fi. When Supabase is not
 * configured (pre-M3), heartbeat is skipped and onLine is used as-is.
 */

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/** Subscribe to browser online/offline events. Returns an unsubscribe fn. */
export function subscribeConnectivity(onChange: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const online = () => onChange(true);
  const offline = () => onChange(false);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}

/**
 * HEAD request with a hard timeout. Resolves false on any failure —
 * callers must treat "unknown" as offline for flushing decisions.
 */
export async function heartbeat(url: string, timeoutMs = 5_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
