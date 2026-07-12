import { getCached, setCached } from "@/lib/client-cache";
import { normalizeFood } from "@/lib/food/client-food";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";
import type { Food } from "@/lib/supabase/types";

const GLOBAL_SEARCH_PREFIX = "global_food_search_v4:";
const GLOBAL_SEARCH_TTL_MS = 10 * 60 * 1_000;
export const GLOBAL_SEARCH_PAGE_SIZE = 50;

interface SearchPayload {
  foods?: unknown[];
  totalCount?: number | null;
  offset?: number;
  limit?: number;
  hasMore?: boolean;
  error?: string;
}

export interface CachedGlobalFoodSearch {
  foods: Food[];
  normalizedQuery: string;
  totalCount: number | null;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/** Render-time ownership guard; effects run too late to prevent an account-switch flash. */
export function canDisplayGlobalFoodSearchState(
  stateUserId: string | null,
  currentUserId: string | null
): boolean {
  return stateUserId === currentUserId;
}

interface FetchGlobalFoodSearchOptions {
  userId: string;
  offset?: number;
  limit?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(Math.trunc(value), maximum));
}

function cacheKey(userId: string, query: string, offset: number, limit: number): string {
  return `${GLOBAL_SEARCH_PREFIX}${userId}:${offset}:${limit}:${query}`;
}

export function getCachedGlobalFoodSearch(
  rawQuery: string,
  userId: string | null | undefined,
  offset = 0,
  limit = GLOBAL_SEARCH_PAGE_SIZE
): CachedGlobalFoodSearch | null {
  const normalizedQuery = normalizeFoodSearchQuery(rawQuery);
  if (!normalizedQuery || !userId) return null;

  return (
    getCached<CachedGlobalFoodSearch>(
      cacheKey(userId, normalizedQuery, offset, limit)
    ) ?? null
  );
}

/**
 * Fetch one stable page of an explicit global search. Cache entries include the
 * authenticated user id because row visibility and library exclusions are
 * user-specific. Callers may paint page zero from cache, then still revalidate.
 */
export async function fetchFreshGlobalFoodSearch(
  rawQuery: string,
  options: FetchGlobalFoodSearchOptions
): Promise<CachedGlobalFoodSearch> {
  const normalizedQuery = normalizeFoodSearchQuery(rawQuery);
  const offset = boundedInteger(options.offset, 0, 0, 5_000);
  const limit = boundedInteger(options.limit, GLOBAL_SEARCH_PAGE_SIZE, 1, 50);
  if (!normalizedQuery) {
    return {
      foods: [],
      normalizedQuery: "",
      totalCount: 0,
      offset,
      limit,
      hasMore: false,
    };
  }
  if (!options.userId) throw new Error("Not authenticated");

  const fetcher = options.fetcher ?? fetch;
  const params = new URLSearchParams({
    q: normalizedQuery,
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetcher(`/api/food/search?${params.toString()}`, {
    method: "GET",
    signal: options.signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
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

  const responseOffset = boundedInteger(payload.offset, offset, 0, 5_000);
  const responseLimit = boundedInteger(payload.limit, limit, 1, 50);
  const totalCount =
    typeof payload.totalCount === "number" &&
    Number.isFinite(payload.totalCount) &&
    payload.totalCount >= 0
      ? Math.trunc(payload.totalCount)
      : null;
  const hasMore =
    typeof payload.hasMore === "boolean"
      ? payload.hasMore
      : totalCount !== null && responseOffset + foods.length < totalCount;

  const result: CachedGlobalFoodSearch = {
    foods,
    normalizedQuery,
    totalCount,
    offset: responseOffset,
    limit: responseLimit,
    hasMore,
  };
  setCached(cacheKey(options.userId, normalizedQuery, offset, limit), result, {
    ttlMs: GLOBAL_SEARCH_TTL_MS,
  });
  return result;
}
