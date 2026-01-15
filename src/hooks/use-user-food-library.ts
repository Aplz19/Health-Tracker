"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Food, FoodInsert } from "@/lib/supabase/types";

// Food with library metadata
export interface LibraryFood extends Food {
  library_id: string;
  added_at: string;
}

export function useUserFoodLibrary(searchQuery: string = "") {
  const [foods, setFoods] = useState<LibraryFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Query user's food library joined with foods table
      let query = supabase
        .from("user_food_library")
        .select(`
          id,
          added_at,
          food:foods (*)
        `)
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      // Transform the joined data
      const libraryFoods: LibraryFood[] = (data || [])
        .filter((item: any) => item.food) // Filter out any orphaned entries
        .map((item: any) => ({
          ...item.food,
          library_id: item.id,
          added_at: item.added_at,
        }));

      // Apply search filter client-side
      const filtered = searchQuery
        ? libraryFoods.filter((f) =>
            f.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : libraryFoods;

      setFoods(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch library");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // Add a food to the user's personal library
  // If it's a new food (FoodInsert), create it in global cache first
  const addToLibrary = async (food: Food | FoodInsert): Promise<Food> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    let savedFood: Food;

    // If it's a new food (no id), insert into global foods table first
    if (!("id" in food)) {
      const { data, error } = await supabase
        .from("foods")
        .insert(food)
        .select()
        .single();

      if (error) throw error;
      savedFood = data as Food;
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
    const { data: { user } } = await supabase.auth.getUser();
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { error } = await supabase
      .from("user_food_library")
      .delete()
      .eq("id", libraryId)
      .eq("user_id", user.id);

    if (error) throw error;

    // Optimistic update
    setFoods((prev) => prev.filter((f) => f.library_id !== libraryId));
  };

  // Update a food in the global cache (user must own it in their library)
  const updateFood = async (foodId: string, updates: Partial<FoodInsert>): Promise<void> => {
    const { error } = await supabase
      .from("foods")
      .update(updates)
      .eq("id", foodId);

    if (error) throw error;

    await fetchLibrary();
  };

  // Check if a food is in user's library
  const isInLibrary = async (foodId: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
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
