"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getCached, setCached } from "@/lib/client-cache";
import type { Food } from "@/lib/supabase/types";
import { normalizeFood } from "@/lib/food/client-food";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";

const GLOBAL_SEARCH_PREFIX = "global_food_search:";
const GLOBAL_SEARCH_TTL_MS = 10 * 60 * 1_000;

interface SearchPayload {
  foods?: unknown[];
  error?: string;
}

export function useGlobalFoodSearch() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const searchGlobal = useCallback(async (query: string): Promise<Food[]> => {
    const normalized = normalizeFoodSearchQuery(query);
    const sequence = ++requestSequence.current;
    activeRequest.current?.abort();

    if (!normalized) {
      setFoods([]);
      setSearchedQuery("");
      setIsSearching(false);
      return [];
    }

    const cacheKey = `${GLOBAL_SEARCH_PREFIX}${normalized}`;
    const cached = getCached<Food[]>(cacheKey);
    if (cached) {
      setFoods(cached);
      setSearchedQuery(normalized);
      setError(null);
      return cached;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setIsSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/food/search?q=${encodeURIComponent(normalized)}`, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as SearchPayload;
      if (!response.ok) throw new Error(payload.error || "Global food search failed");

      const results = (payload.foods || [])
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
      setCached(cacheKey, results, { ttlMs: GLOBAL_SEARCH_TTL_MS });
      if (sequence !== requestSequence.current) return results;
      setFoods(results);
      setSearchedQuery(normalized);
      return results;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return [];
      if (sequence !== requestSequence.current) return [];
      setFoods([]);
      setSearchedQuery(normalized);
      setError(err instanceof Error ? err.message : "Global food search failed");
      return [];
    } finally {
      if (sequence === requestSequence.current) {
        setIsSearching(false);
        activeRequest.current = null;
      }
    }
  }, []);

  const clearGlobal = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setFoods([]);
    setSearchedQuery("");
    setError(null);
    setIsSearching(false);
  }, []);

  useEffect(() => () => activeRequest.current?.abort(), []);

  return {
    foods,
    searchedQuery,
    isSearching,
    error,
    searchGlobal,
    clearGlobal,
  };
}
