"use client";

import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, setCached } from "@/lib/client-cache";
import type { Food } from "@/lib/supabase/types";

const GLOBAL_SEARCH_PREFIX = "global_food_search:";

function normalizeQuery(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

export function useGlobalFoodSearch() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchGlobal = useCallback(async (query: string): Promise<Food[]> => {
    const normalized = normalizeQuery(query);
    if (!normalized) {
      setFoods([]);
      setSearchedQuery("");
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

    setIsSearching(true);
    setError(null);
    try {
      const { data, error: searchError } = await supabase.rpc(
        "search_global_foods",
        { search_query: normalized, result_limit: 50 }
      );
      if (searchError) throw searchError;
      const results = ((data || []) as Array<Omit<Food, "embedding">>).map(
        (food) => ({ ...food, embedding: null })
      );
      setCached(cacheKey, results);
      setFoods(results);
      setSearchedQuery(normalized);
      return results;
    } catch (err) {
      setFoods([]);
      setSearchedQuery(normalized);
      setError(err instanceof Error ? err.message : "Global food search failed");
      return [];
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearGlobal = useCallback(() => {
    setFoods([]);
    setSearchedQuery("");
    setError(null);
  }, []);

  return {
    foods,
    searchedQuery,
    isSearching,
    error,
    searchGlobal,
    clearGlobal,
  };
}
