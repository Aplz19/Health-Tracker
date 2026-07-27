"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Food, FoodInsert } from "@/lib/supabase/types";
import {
  FOOD_CLIENT_COLUMNS,
  FOOD_CLIENT_V2_COLUMNS,
  normalizeFood,
} from "@/lib/food/client-food";
import { matchAndRankFoodSearchResults } from "@/lib/food/search-query";
import { useAuth } from "@/contexts/auth-context";

// Food with library metadata
export interface LibraryFood extends Food {
  library_id: string;
  added_at: string;
}

// add_food_search_v2.sql revoked INSERT/UPDATE/DELETE on foods and
// user_food_library from `authenticated`, so every client write must go through
// a SECURITY DEFINER RPC (or the service-role barcode API). If an RPC is
// missing, the deployment is inconsistent: fail loudly with something
// actionable rather than attempting a direct write that RLS will deny with an
// opaque permission error.
function missingRpcError(rpc: string): Error {
  return new Error(
    `Food database is out of date: the "${rpc}" function is missing. ` +
      `Run sql/add_food_search_v2.sql in Supabase.`
  );
}

function isMissingRpc(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error &&
      (error.code === "PGRST202" ||
        error.message?.toLowerCase().includes("could not find the function"))
  );
}

function isMissingV2FoodProjection(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST200" ||
    error.code === "PGRST204" ||
    (message.includes("schema cache") && message.includes("foods")) ||
    (message.includes("column") && message.includes("does not exist"))
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

export function useUserFoodLibrary(searchQuery: string = "") {
  const { user } = useAuth();
  const cacheKey = `user_food_library:${user?.id ?? "anonymous"}`;
  const activeCacheKeyRef = useRef(cacheKey);
  // The full (unfiltered) library is fetched ONCE and searched in memory.
  // Previously searchQuery was a dependency of the fetch, so every keystroke
  // in the search box re-downloaded the entire library from Supabase.
  const [allFoodsState, setAllFoodsState] = useState<LibraryFood[]>(
    () => getCached<LibraryFood[]>(cacheKey) ?? []
  );
  const [stateCacheKey, setStateCacheKey] = useState(cacheKey);
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    activeCacheKeyRef.current = cacheKey;
  }, [cacheKey]);
  // The key guard takes effect during render, before an account-change effect
  // runs, so one user's library can never flash for another user.
  const cachedFoods = getCached<LibraryFood[]>(cacheKey);
  const allFoods = useMemo(
    () => (stateCacheKey === cacheKey ? allFoodsState : cachedFoods ?? []),
    [allFoodsState, cacheKey, cachedFoods, stateCacheKey]
  );
  const activeIsLoading =
    stateCacheKey === cacheKey ? isLoading : cachedFoods === undefined;
  const activeError = stateCacheKey === cacheKey ? error : null;

  // Write-through setter keeps the session cache in sync.
  const setAllFoods = useCallback((updater: React.SetStateAction<LibraryFood[]>) => {
    if (activeCacheKeyRef.current !== cacheKey) return;
    setStateCacheKey(cacheKey);
    setAllFoodsState((prev) => {
      const base =
        stateCacheKey === cacheKey
          ? prev
          : getCached<LibraryFood[]>(cacheKey) ?? [];
      const next = typeof updater === "function" ? updater(base) : updater;
      setCached(cacheKey, next);
      return next;
    });
  }, [cacheKey, stateCacheKey]);

  const fetchLibrary = useCallback(async () => {
    // Yield once so an auth/cache-key change commits before this request may
    // update visible state, and so mounting the hook does not cascade renders.
    await Promise.resolve();
    const cached = getCached<LibraryFood[]>(cacheKey);
    if (activeCacheKeyRef.current === cacheKey) {
      setStateCacheKey(cacheKey);
      setAllFoodsState(cached ?? []);
      setIsLoading(cached === undefined);
      setError(null);
    }

    if (!user) {
      if (activeCacheKeyRef.current === cacheKey) setIsLoading(false);
      return;
    }

    try {
      const fetchRows = (foodColumns: string) =>
        supabase
          .from("user_food_library")
          .select(`
            id,
            added_at,
            food:foods (${foodColumns})
          `)
          .eq("user_id", user.id)
          .order("added_at", { ascending: false });

      // Current production includes structured brand/alias fields so a saved
      // restaurant item remains searchable by chain. Keep one bounded legacy
      // retry for an environment that has not applied the v2 migration yet.
      let response = await fetchRows(FOOD_CLIENT_V2_COLUMNS);
      if (response.error && isMissingV2FoodProjection(response.error)) {
        response = await fetchRows(FOOD_CLIENT_COLUMNS);
      }
      const { data, error } = response;

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

      setCached(cacheKey, libraryFoods);
      if (activeCacheKeyRef.current === cacheKey) {
        setStateCacheKey(cacheKey);
        setAllFoodsState(libraryFoods);
      }
    } catch (err) {
      if (activeCacheKeyRef.current === cacheKey) {
        setError(err instanceof Error ? err.message : "Failed to fetch library");
      }
    } finally {
      if (activeCacheKeyRef.current === cacheKey) setIsLoading(false);
    }
  }, [cacheKey, user]);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  // In-memory search — instant, no network per keystroke.
  const foods = useMemo(
    () => matchAndRankFoodSearchResults(allFoods, searchQuery) as LibraryFood[],
    [allFoods, searchQuery]
  );

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
          throw missingRpcError("save_my_manual_food");
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
          // 503 = the server has no service-role key, so it cannot write the
          // global food row. The client cannot do it either (writes revoked).
          throw new Error(
            "Barcode saving is unavailable: the server is missing SUPABASE_SERVICE_ROLE_KEY."
          );
        }
      } else {
        // Non-manual food with no barcode. Nothing in the UI produces this
        // (the add-food form sets source: "manual"), and there is no RPC for
        // it, so treat it as a bug rather than attempting a revoked insert.
        throw new Error(
          "Cannot save this food: it has no barcode and is not a manual food."
        );
      }
    } else {
      savedFood = food;
    }

    // Check if already in user's library
    if (!libraryAlreadyLinked) {
      await addExistingToLibrary(savedFood.id, false);
    }

    // Revalidate in the background instead of blocking on it. The food is
    // already persisted at this point, so awaiting a full library refetch here
    // only added a round trip to the caller's wait (the scan felt ~a second
    // slower than it needed to). The list updates as soon as it lands.
    void fetchLibrary();

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
    throw missingRpcError("add_food_to_my_library");
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
      throw missingRpcError("remove_food_from_my_library");
    }

    // No cached row for this library_id — nothing we can resolve to a food id.
    throw new Error("Could not find that food in your library.");
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
    throw missingRpcError("save_my_manual_food");
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
    isLoading: activeIsLoading,
    error: activeError,
    addToLibrary,
    addExistingToLibrary,
    removeFromLibrary,
    updateFood,
    isInLibrary,
    refetch: fetchLibrary,
  };
}
