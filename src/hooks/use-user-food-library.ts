"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Food, FoodInsert } from "@/lib/supabase/types";

// Food with library metadata
export interface LibraryFood extends Food {
  library_id: string;
  added_at: string;
}

const LIBRARY_CACHE_KEY = "user_food_library";

export function useUserFoodLibrary(searchQuery: string = "") {
  // The full (unfiltered) library is fetched ONCE and searched in memory.
  // Previously searchQuery was a dependency of the fetch, so every keystroke
  // in the search box re-downloaded the entire library from Supabase.
  const [allFoods, setAllFoodsState] = useState<LibraryFood[]>(
    () => getCached<LibraryFood[]>(LIBRARY_CACHE_KEY) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(LIBRARY_CACHE_KEY));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter keeps the session cache in sync.
  const setAllFoods = useCallback((updater: React.SetStateAction<LibraryFood[]>) => {
    setAllFoodsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCached(LIBRARY_CACHE_KEY, next);
      return next;
    });
  }, []);

  const fetchLibrary = useCallback(async () => {
    if (!hasCached(LIBRARY_CACHE_KEY)) setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      // Query user's food library joined with foods table
      const { data, error } = await supabase
        .from("user_food_library")
        .select(`
          id,
          added_at,
          food:foods (*)
        `)
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (error) throw error;

      // Transform the joined data
      const libraryFoods: LibraryFood[] = (data || [])
        .filter((item: any) => item.food) // Filter out any orphaned entries
        .map((item: any) => ({
          ...item.food,
          library_id: item.id,
          added_at: item.added_at,
        }));

      setAllFoods(libraryFoods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch library");
    } finally {
      setIsLoading(false);
    }
  }, [setAllFoods]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // In-memory search — instant, no network per keystroke.
  const foods = useMemo(() => {
    if (!searchQuery) return allFoods;
    const q = searchQuery.toLowerCase();
    return allFoods.filter((f) => f.name.toLowerCase().includes(q));
  }, [allFoods, searchQuery]);

  // Add a food to the user's personal library
  // If it's a new food (FoodInsert), create it in global cache first
  // If a food with the same barcode exists, reuse it instead of creating a duplicate
  const addToLibrary = async (food: Food | FoodInsert): Promise<Food> => {
    const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
    if (!user) throw new Error("Not authenticated");

    let savedFood: Food;

    // If it's a new food (no id), check for existing barcode first
    if (!("id" in food)) {
      // Check if a food with this barcode already exists in global library
      if (food.barcode) {
        const { data: existingByBarcode } = await supabase
          .from("foods")
          .select("*")
          .eq("barcode", food.barcode)
          .single();

        if (existingByBarcode) {
          // Reuse existing food entry
          savedFood = existingByBarcode as Food;
        } else {
          // Create new food entry
          const { data, error } = await supabase
            .from("foods")
            .insert(food)
            .select()
            .single();

          if (error) throw error;
          savedFood = data as Food;
        }
      } else {
        // No barcode, create new entry
        const { data, error } = await supabase
          .from("foods")
          .insert(food)
          .select()
          .single();

        if (error) throw error;
        savedFood = data as Food;
      }
    } else {
      savedFood = food;
    }

    // Check if already in user's library
    const { data: existing } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", savedFood.id)
      .single();

    if (!existing) {
      // Add to user's library
      const { error: libError } = await supabase
        .from("user_food_library")
        .insert({
          user_id: user.id,
          food_id: savedFood.id,
        });

      if (libError) throw libError;
    }

    // Refresh the library
    await fetchLibrary();

    return savedFood;
  };

  // Add existing food to library (just creates the link)
  const addExistingToLibrary = async (foodId: string): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
    if (!user) throw new Error("Not authenticated");

    // Check if already in library
    const { data: existing } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", foodId)
      .single();

    if (existing) return; // Already in library

    const { error } = await supabase
      .from("user_food_library")
      .insert({
        user_id: user.id,
        food_id: foodId,
      });

    if (error) throw error;

    await fetchLibrary();
  };

  // Remove food from user's library (doesn't delete from global cache)
  const removeFromLibrary = async (libraryId: string): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("user_food_library")
      .delete()
      .eq("id", libraryId)
      .eq("user_id", user.id);

    if (error) throw error;

    // Optimistic update
    setAllFoods((prev) => prev.filter((f) => f.library_id !== libraryId));
  };

  // Update a food in the global cache (user must own it in their library)
  const updateFood = async (foodId: string, updates: Partial<FoodInsert>): Promise<void> => {
    const { error, count } = await supabase
      .from("foods")
      .update(updates)
      .eq("id", foodId)
      .select();

    if (error) {
      console.error("Failed to update food:", error);
      throw error;
    }

    await fetchLibrary();
  };

  // Check if a food is in user's library
  const isInLibrary = async (foodId: string): Promise<boolean> => {
    const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
    if (!user) return false;

    const { data } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", foodId)
      .single();

    return !!data;
  };

  return {
    foods,
    isLoading,
    error,
    addToLibrary,
    addExistingToLibrary,
    removeFromLibrary,
    updateFood,
    isInLibrary,
    refetch: fetchLibrary,
  };
}
