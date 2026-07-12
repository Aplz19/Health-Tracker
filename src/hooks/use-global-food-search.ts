"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import type { Food } from "@/lib/supabase/types";
import {
  canDisplayGlobalFoodSearchState,
  fetchFreshGlobalFoodSearch,
  getCachedGlobalFoodSearch,
  GLOBAL_SEARCH_PAGE_SIZE,
} from "@/lib/food/global-search-client";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";

export function useGlobalFoodSearch() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [stateUserId, setStateUserId] = useState<string | null>(userId);
  const [foods, setFoods] = useState<Food[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const nextOffset = useRef(0);
  const loadingMoreRequest = useRef(false);
  const previousUserId = useRef(userId);

  const searchGlobal = useCallback(async (query: string): Promise<Food[]> => {
    const normalized = normalizeFoodSearchQuery(query);
    const sequence = ++requestSequence.current;
    activeRequest.current?.abort();
    setStateUserId(userId);

    if (!normalized || !userId) {
      setFoods([]);
      setSearchedQuery("");
      setTotalCount(normalized ? null : 0);
      setHasMore(false);
      setIsSearching(false);
      setIsLoadingMore(false);
      nextOffset.current = 0;
      return [];
    }

    const cached = getCachedGlobalFoodSearch(normalized, userId);
    let showedCachedResults = false;
    if (cached) {
      showedCachedResults = true;
      setFoods(cached.foods);
      setSearchedQuery(cached.normalizedQuery);
      setTotalCount(cached.totalCount);
      setHasMore(cached.hasMore);
      nextOffset.current = cached.offset + cached.foods.length;
      setError(null);
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setIsSearching(true);
    setIsLoadingMore(false);
    setError(null);
    try {
      const fresh = await fetchFreshGlobalFoodSearch(normalized, {
        userId,
        signal: controller.signal,
      });
      if (sequence !== requestSequence.current) return fresh.foods;
      setFoods(fresh.foods);
      setSearchedQuery(fresh.normalizedQuery);
      setTotalCount(fresh.totalCount);
      setHasMore(fresh.hasMore);
      nextOffset.current = fresh.offset + fresh.foods.length;
      return fresh.foods;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return [];
      if (sequence !== requestSequence.current) return [];
      if (!showedCachedResults) {
        setFoods([]);
        setTotalCount(null);
        setHasMore(false);
        nextOffset.current = 0;
      }
      setSearchedQuery(normalized);
      setError(err instanceof Error ? err.message : "Global food search failed");
      return [];
    } finally {
      if (sequence === requestSequence.current) {
        setIsSearching(false);
        activeRequest.current = null;
      }
    }
  }, [userId]);

  const loadMore = useCallback(async (): Promise<Food[]> => {
    if (
      !userId ||
      stateUserId !== userId ||
      !searchedQuery ||
      !hasMore ||
      isSearching ||
      loadingMoreRequest.current
    ) {
      return [];
    }

    const sequence = requestSequence.current;
    const offset = nextOffset.current;
    const controller = new AbortController();
    activeRequest.current = controller;
    loadingMoreRequest.current = true;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await fetchFreshGlobalFoodSearch(searchedQuery, {
        userId,
        offset,
        limit: GLOBAL_SEARCH_PAGE_SIZE,
        signal: controller.signal,
      });
      if (sequence !== requestSequence.current) return page.foods;

      setFoods((current) => {
        const seen = new Set(current.map((food) => food.id));
        return [...current, ...page.foods.filter((food) => !seen.has(food.id))];
      });
      setTotalCount(page.totalCount);
      setHasMore(page.foods.length > 0 && page.hasMore);
      nextOffset.current = page.offset + page.foods.length;
      return page.foods;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return [];
      if (sequence !== requestSequence.current) return [];
      setError(err instanceof Error ? err.message : "Could not load more foods");
      return [];
    } finally {
      loadingMoreRequest.current = false;
      if (sequence === requestSequence.current) {
        setIsLoadingMore(false);
        activeRequest.current = null;
      }
    }
  }, [hasMore, isSearching, searchedQuery, stateUserId, userId]);

  const clearGlobal = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    nextOffset.current = 0;
    loadingMoreRequest.current = false;
    setFoods([]);
    setSearchedQuery("");
    setTotalCount(null);
    setHasMore(false);
    setError(null);
    setIsSearching(false);
    setIsLoadingMore(false);
  }, []);

  useEffect(() => {
    if (previousUserId.current !== userId) {
      previousUserId.current = userId;
      clearGlobal();
    }
  }, [clearGlobal, userId]);

  useEffect(() => () => activeRequest.current?.abort(), []);

  // Effects run after paint. Guard the materialized state during render so an
  // account switch can never flash the previous user's results or manual foods.
  const stateBelongsToUser = canDisplayGlobalFoodSearchState(stateUserId, userId);

  return {
    foods: stateBelongsToUser ? foods : [],
    searchedQuery: stateBelongsToUser ? searchedQuery : "",
    totalCount: stateBelongsToUser ? totalCount : null,
    hasMore: stateBelongsToUser ? hasMore : false,
    isSearching: stateBelongsToUser ? isSearching : false,
    isLoadingMore: stateBelongsToUser ? isLoadingMore : false,
    error: stateBelongsToUser ? error : null,
    searchGlobal,
    loadMore,
    clearGlobal,
  };
}
