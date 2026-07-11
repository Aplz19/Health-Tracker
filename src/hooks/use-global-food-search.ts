"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Food } from "@/lib/supabase/types";
import {
  fetchFreshGlobalFoodSearch,
  getCachedGlobalFoodSearch,
} from "@/lib/food/global-search-client";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";

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

    const cached = getCachedGlobalFoodSearch(normalized);
    let showedCachedResults = false;
    if (cached) {
      showedCachedResults = true;
      setFoods(cached.foods);
      setSearchedQuery(cached.normalizedQuery);
      setError(null);
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setIsSearching(true);
    setError(null);
    try {
      const fresh = await fetchFreshGlobalFoodSearch(normalized, controller.signal);
      if (sequence !== requestSequence.current) return fresh.foods;
      setFoods(fresh.foods);
      setSearchedQuery(fresh.normalizedQuery);
      return fresh.foods;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return [];
      if (sequence !== requestSequence.current) return [];
      if (!showedCachedResults) setFoods([]);
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
