import { getCached, setCached } from "@/lib/client-cache";
import { normalizeFood } from "@/lib/food/client-food";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";
import type { Food } from "@/lib/supabase/types";

const GLOBAL_SEARCH_PREFIX = "global_food_search:";
const GLOBAL_SEARCH_TTL_MS = 10 * 60 * 1_000;

interface SearchPayload {
  foods?: unknown[];
  error?: string;
}

export interface CachedGlobalFoodSearch {
  foods: Food[];
  normalizedQuery: string;
}

export function getCachedGlobalFoodSearch(rawQuery: string): CachedGlobalFoodSearch | null {
  const normalizedQuery = normalizeFoodSearchQuery(rawQuery);
  if (!normalizedQuery) return null;

  const foods = getCached<Food[]>(`${GLOBAL_SEARCH_PREFIX}${normalizedQuery}`);
  return foods ? { foods, normalizedQuery } : null;
}

/**
 * Fetch a fresh result for an explicit global search and replace the short-lived
 * cache. Callers may paint getCachedGlobalFoodSearch() first, but must still call
 * this function so a catalog rollout cannot leave a session on stale results.
 */
export async function fetchFreshGlobalFoodSearch(
  rawQuery: string,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<CachedGlobalFoodSearch> {
  const normalizedQuery = normalizeFoodSearchQuery(rawQuery);
  if (!normalizedQuery) return { foods: [], normalizedQuery: "" };

  const response = await fetcher(
    `/api/food/search?q=${encodeURIComponent(normalizedQuery)}`,
    {
      method: "GET",
      signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    }
  );
  const payload = (await response.json()) as SearchPayload;
  if (!response.ok) throw new Error(payload.error || "Global food search failed");

  const foods = (payload.foods || [])
    .filter((row): row is Parameters<typeof normalizeFood>[0] => {
      if (!row || typeof row !== "object") return false;
      const value = row as Record<string, unknown>;
      return (
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.serving_size === "string"
      );
    })
    .map(normalizeFood);

  setCached(`${GLOBAL_SEARCH_PREFIX}${normalizedQuery}`, foods, {
    ttlMs: GLOBAL_SEARCH_TTL_MS,
  });
  return { foods, normalizedQuery };
}
