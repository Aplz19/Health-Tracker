"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Food, FoodInsert } from "@/lib/supabase/types";

export function useFoodSearch() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search local database (global food cache)
  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setFoods([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("foods")
        .select("*")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(50);

      if (error) throw error;
      setFoods(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to search foods");
      setFoods([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Save a food to our global cache
  const saveToCache = useCallback(async (food: FoodInsert): Promise<Food> => {
    const { data, error } = await supabase
      .from("foods")
      .insert(food)
      .select()
      .single();

    if (error) throw error;
    return data as Food;
  }, []);

  // Clear results
  const clearResults = useCallback(() => {
    setFoods([]);
  }, []);

  return {
    foods,
    isSearching,
    error,
    search,
    saveToCache,
    clearResults,
  };
}
