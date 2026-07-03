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

const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function hasCached(key: string): boolean {
  return store.has(key);
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}

/** Drop everything (sign-out) so no data leaks across accounts. */
export function clearClientCache(): void {
  store.clear();
}
