// Session-scoped client cache (stale-while-revalidate).
//
// Data hooks keyed by date refetch from scratch on every mount — every tab
// switch and date change previously showed "Loading..." even for data fetched
// seconds earlier. Hooks now seed their state from this cache instantly and
// revalidate in the background, so revisiting a tab or date renders in one
// frame with fresh data following silently.
//
// Memory-only by design: it resets on reload, holds nothing sensitive beyond
// what the UI already displays, and is cleared on sign-out (auth-context).

interface CacheEntry {
  value: unknown;
  expiresAt: number | null;
}

interface CacheOptions {
  /** How long this value may be reused. Session data has no TTL by default. */
  ttlMs?: number;
}

const MAX_ENTRIES = 200;
const store = new Map<string, CacheEntry>();

function deleteExpired(now = Date.now()): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) {
      store.delete(key);
    }
  }
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }

  // Reinsert on read so Map iteration order doubles as an LRU queue.
  store.delete(key);
  store.set(key, entry);
  return entry.value as T;
}

export function hasCached(key: string): boolean {
  return getCached(key) !== undefined;
}

export function setCached<T>(key: string, value: T, options: CacheOptions = {}): void {
  deleteExpired();
  store.delete(key);
  store.set(key, {
    value,
    expiresAt: options.ttlMs === undefined ? null : Date.now() + options.ttlMs,
  });

  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

/** Remove a single entry or a related family of entries. */
export function deleteCached(keyOrPrefix: string, prefix = false): void {
  if (!prefix) {
    store.delete(keyOrPrefix);
    return;
  }

  for (const key of store.keys()) {
    if (key.startsWith(keyOrPrefix)) store.delete(key);
  }
}

/** Drop everything (sign-out) so no data leaks across accounts. */
export function clearClientCache(): void {
  store.clear();
}
