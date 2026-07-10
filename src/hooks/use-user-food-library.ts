"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Food, FoodInsert } from "@/lib/supabase/types";
import {
  FOOD_CLIENT_COLUMNS,
  FOOD_CLIENT_V2_COLUMNS,
  normalizeFood,
} from "@/lib/food/client-food";
import { normalizeFoodSearchQuery } from "@/lib/food/search-query";
import { useAuth } from "@/contexts/auth-context";

// Food with library metadata
export interface LibraryFood extends Food {
  library_id: string;
  added_at: string;
}

function normalizeSearchText(value: string): string {
  return normalizeFoodSearchQuery(value);
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "PGRST202" ||
        error.message?.toLowerCase().includes("could not find the function"))
  );
}

function toManualFoodInput(food: Food | FoodInsert) {
  return {
    name: food.name,
    brand: food.brand ?? null,
    serving_size: food.serving_size,
    serving_size_grams: food.serving_size_grams,
    calories: food.calories,
    protein: food.protein,
    total_fat: food.total_fat,
    saturated_fat: food.saturated_fat,
    trans_fat: food.trans_fat,
    polyunsaturated_fat: food.polyunsaturated_fat,
    monounsaturated_fat: food.monounsaturated_fat,
    cholesterol: food.cholesterol ?? null,
    sodium: food.sodium,
    total_carbohydrates: food.total_carbohydrates,
    fiber: food.fiber,
    sugar: food.sugar,
    added_sugar: food.added_sugar,
    vitamin_a: food.vitamin_a,
    vitamin_c: food.vitamin_c,
    vitamin_d: food.vitamin_d,
    calcium: food.calcium,
    iron: food.iron,
  };
}

const LEGACY_MUTABLE_FOOD_FIELDS = [
  "name",
  "serving_size",
  "serving_size_grams",
  "calories",
  "protein",
  "total_fat",
  "saturated_fat",
  "trans_fat",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "sodium",
  "total_carbohydrates",
  "fiber",
  "sugar",
  "added_sugar",
  "vitamin_a",
  "vitamin_c",
  "vitamin_d",
  "calcium",
  "iron",
  "fdc_id",
  "barcode",
  "source",
] as const;

function toLegacyFoodMutation(food: Partial<FoodInsert>): Record<string, unknown> {
  const source = food as Record<string, unknown>;
  return Object.fromEntries(
    LEGACY_MUTABLE_FOOD_FIELDS
      .filter((field) => field in source)
      .map((field) => [field, source[field]])
  );
}

export function useUserFoodLibrary(searchQuery: string = "") {
  const { user } = useAuth();
  const cacheKey = `user_food_library:${user?.id ?? "anonymous"}`;
  // The full (unfiltered) library is fetched ONCE and searched in memory.
  // Previously searchQuery was a dependency of the fetch, so every keystroke
  // in the search box re-downloaded the entire library from Supabase.
  const [allFoods, setAllFoodsState] = useState<LibraryFood[]>(
    () => getCached<LibraryFood[]>(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter keeps the session cache in sync.
  const setAllFoods = useCallback((updater: React.SetStateAction<LibraryFood[]>) => {
    setAllFoodsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCached(cacheKey, next);
      return next;
    });
  }, [cacheKey]);

  const fetchLibrary = useCallback(async () => {
    if (!hasCached(cacheKey)) setIsLoading(true);
    setError(null);

    try {
      if (!user) throw new Error("Not authenticated");

      // Query user's food library joined with foods table
      const { data, error } = await supabase
        .from("user_food_library")
        .select(`
          id,
          added_at,
          food:foods (${FOOD_CLIENT_COLUMNS})
        `)
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (error) throw error;

      // Transform the joined data
      const rows = (data || []) as unknown as Array<{
        id: string;
        added_at: string;
        food: Parameters<typeof normalizeFood>[0] | null;
      }>;
      const libraryFoods: LibraryFood[] = rows
        .filter((item) => item.food !== null)
        .map((item) => ({
          ...normalizeFood(item.food!),
          library_id: item.id,
          added_at: item.added_at,
        }));

      setAllFoods(libraryFoods);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch library");
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, setAllFoods, user]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // In-memory search — instant, no network per keystroke.
  const foods = useMemo(() => {
    if (!searchQuery) return allFoods;
    const terms = normalizeSearchText(searchQuery).split(" ").filter(Boolean);
    return allFoods.filter((food) => {
      const searchable = normalizeSearchText([
        food.name,
        food.brand,
        food.brand_slug,
        ...(food.search_aliases || []),
        food.variant_label,
        food.source_category,
      ].filter(Boolean).join(" "));
      const compact = searchable.replace(/\s+/g, "");
      return terms.every((term) => searchable.includes(term) || compact.includes(term));
    });
  }, [allFoods, searchQuery]);

  // Add a food to the user's personal library
  // If it's a new food (FoodInsert), create it in global cache first
  // If a food with the same barcode exists, reuse it instead of creating a duplicate
  const addToLibrary = async (food: Food | FoodInsert): Promise<Food> => {
    if (!user) throw new Error("Not authenticated");

    let savedFood: Food;
    let libraryAlreadyLinked = false;

    // If it's a new food (no id), check for existing barcode first
    if (!("id" in food)) {
      if (food.source === "manual") {
        const { data: savedId, error: rpcError } = await supabase.rpc(
          "save_my_manual_food",
          { food_id_param: null, food_input: toManualFoodInput(food) }
        );
        if (!rpcError && typeof savedId === "string") {
          const { data, error } = await supabase
            .from("foods")
            .select(FOOD_CLIENT_V2_COLUMNS)
            .eq("id", savedId)
            .single();
          if (error) throw error;
          savedFood = normalizeFood(
            data as unknown as Parameters<typeof normalizeFood>[0]
          );
          libraryAlreadyLinked = true;
        } else if (rpcError && !isMissingRpc(rpcError)) {
          throw rpcError;
        } else {
          // Compatibility path until add_food_search_v2.sql is deployed.
          const { data, error } = await supabase
            .from("foods")
            .insert(toLegacyFoodMutation(food))
            .select(FOOD_CLIENT_COLUMNS)
            .single();
          if (error) throw error;
          savedFood = normalizeFood(
            data as unknown as Parameters<typeof normalizeFood>[0]
          );
        }
      // Check if a food with this barcode already exists in global library
      } else if (food.barcode) {
        const response = await fetch("/api/food/barcode", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ barcode: food.barcode }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { food?: unknown };
          if (!payload.food || typeof payload.food !== "object") {
            throw new Error("Barcode save returned an invalid food");
          }
          savedFood = normalizeFood(
            payload.food as Parameters<typeof normalizeFood>[0]
          );
          libraryAlreadyLinked = true;
        } else if (response.status !== 503) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Could not save barcode food");
        } else {
          // Legacy local deployments may not have a service-role key yet.
        const { data: existingByBarcode } = await supabase
          .from("foods")
          .select(FOOD_CLIENT_COLUMNS)
          .eq("barcode", food.barcode)
          .maybeSingle();

        if (existingByBarcode) {
          // Reuse existing food entry
          savedFood = normalizeFood(
            existingByBarcode as unknown as Parameters<typeof normalizeFood>[0]
          );
        } else {
          // Create new food entry
          const { data, error } = await supabase
            .from("foods")
            .insert(toLegacyFoodMutation(food))
            .select(FOOD_CLIENT_COLUMNS)
            .single();

          if (error) throw error;
          savedFood = normalizeFood(
            data as unknown as Parameters<typeof normalizeFood>[0]
          );
        }
        }
      } else {
        // No barcode, create new entry
        const { data, error } = await supabase
          .from("foods")
          .insert(toLegacyFoodMutation(food))
          .select(FOOD_CLIENT_COLUMNS)
          .single();

        if (error) throw error;
        savedFood = normalizeFood(
          data as unknown as Parameters<typeof normalizeFood>[0]
        );
      }
    } else {
      savedFood = food;
    }

    // Check if already in user's library
    if (!libraryAlreadyLinked) {
      await addExistingToLibrary(savedFood.id, false);
    }

    // Refresh the library
    await fetchLibrary();

    return savedFood;
  };

  // Add existing food to library (just creates the link)
  const addExistingToLibrary = async (foodId: string, refresh = true): Promise<void> => {
    if (!user) throw new Error("Not authenticated");

    const { error: rpcError } = await supabase.rpc("add_food_to_my_library", {
      food_id_param: foodId,
    });
    if (!rpcError) {
      if (refresh) await fetchLibrary();
      return;
    }
    if (!isMissingRpc(rpcError)) throw rpcError;

    // Compatibility path until add_food_search_v2.sql is deployed.
    const { data: existing } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", foodId)
      .maybeSingle();

    if (existing) return;

    const { error } = await supabase
      .from("user_food_library")
      .insert({
        user_id: user.id,
        food_id: foodId,
      });

    if (error) throw error;

    if (refresh) await fetchLibrary();
  };

  // Remove food from user's library (doesn't delete from global cache)
  const removeFromLibrary = async (libraryId: string): Promise<void> => {
    if (!user) throw new Error("Not authenticated");

    const food = allFoods.find((item) => item.library_id === libraryId);
    if (food) {
      const { error: rpcError } = await supabase.rpc("remove_food_from_my_library", {
        food_id_param: food.id,
      });
      if (!rpcError) {
        setAllFoods((prev) => prev.filter((item) => item.library_id !== libraryId));
        return;
      }
      if (!isMissingRpc(rpcError)) throw rpcError;
    }

    // Compatibility path until add_food_search_v2.sql is deployed.
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
    if (!user) throw new Error("Not authenticated");

    const existingFood = allFoods.find((food) => food.id === foodId);
    if (!existingFood) throw new Error("Food is not in your library");

    const mergedFood = { ...existingFood, ...updates };
    const { error: rpcError } = await supabase.rpc("save_my_manual_food", {
      food_id_param: foodId,
      food_input: toManualFoodInput(mergedFood),
    });
    if (!rpcError) {
      await fetchLibrary();
      return;
    }
    if (!isMissingRpc(rpcError)) throw rpcError;

    // Compatibility path until add_food_search_v2.sql is deployed.
    const { data: libraryEntry } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", foodId)
      .maybeSingle();
    if (!libraryEntry) throw new Error("Food is not in your library");

    const { error } = await supabase
      .from("foods")
      .update(toLegacyFoodMutation(updates))
      .eq("id", foodId)
      .eq("source", "manual");

    if (error) {
      console.error("Failed to update food:", error);
      throw error;
    }

    await fetchLibrary();
  };

  // Check if a food is in user's library
  const isInLibrary = async (foodId: string): Promise<boolean> => {
    if (!user) return false;

    const { data } = await supabase
      .from("user_food_library")
      .select("id")
      .eq("user_id", user.id)
      .eq("food_id", foodId)
      .maybeSingle();

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
