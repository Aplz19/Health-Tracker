"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Food, SavedMealPreset, SavedMealPresetItem } from "@/lib/supabase/types";
import { FOOD_CLIENT_COLUMNS, normalizeFood } from "@/lib/food/client-food";

// Preset with joined food data
export interface SavedMealPresetWithItems extends SavedMealPreset {
  items: Array<SavedMealPresetItem & { food: Food }>;
}

const PRESETS_CACHE_KEY = "saved_meal_presets";

export function useSavedMealPresets() {
  const [presets, setPresetsState] = useState<SavedMealPresetWithItems[]>(
    () => getCached<SavedMealPresetWithItems[]>(PRESETS_CACHE_KEY) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(PRESETS_CACHE_KEY));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter keeps the session cache in sync.
  const setPresets = useCallback(
    (updater: React.SetStateAction<SavedMealPresetWithItems[]>) => {
      setPresetsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCached(PRESETS_CACHE_KEY, next);
        return next;
      });
    },
    []
  );

  const fetchPresets = useCallback(async () => {
    if (!hasCached(PRESETS_CACHE_KEY)) setIsLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      // Fetch presets with their items and food data
      const { data, error } = await supabase
        .from("saved_meal_presets")
        .select(
          `
          *,
          items:saved_meal_preset_items (
            *,
            food:foods (${FOOD_CLIENT_COLUMNS})
          )
        `
        )
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;

      // Sort items within each preset by sort_order
      const rows = (data || []) as unknown as Array<SavedMealPreset & {
        items: Array<SavedMealPresetItem & {
          food: Parameters<typeof normalizeFood>[0];
        }>;
      }>;
      const sorted = rows.map((preset) => ({
        ...preset,
        items: preset.items
          .map((item) => ({ ...item, food: normalizeFood(item.food) }))
          .sort((a, b) => a.sort_order - b.sort_order),
      }));

      setPresets(sorted as SavedMealPresetWithItems[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch presets");
    } finally {
      setIsLoading(false);
    }
  }, [setPresets]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Create or replace a preset with a bounded number of database requests.
  // The legacy implementation refetched the full preset graph after every
  // individual item delete/insert, making an N-item edit roughly 2N queries.
  const savePreset = async (
    name: string,
    items: Array<{ foodId: string; servings: number }>,
    presetId?: string
  ): Promise<void> => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw new Error("Not authenticated");

    let id = presetId;
    if (id) {
      const { error } = await supabase
        .from("saved_meal_presets")
        .update({ name, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;

      const { error: deleteError } = await supabase
        .from("saved_meal_preset_items")
        .delete()
        .eq("preset_id", id);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await supabase
        .from("saved_meal_presets")
        .insert({ user_id: user.id, name })
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }

    if (items.length > 0) {
      const { error } = await supabase.from("saved_meal_preset_items").insert(
        items.map((item, sortOrder) => ({
          preset_id: id!,
          food_id: item.foodId,
          servings: item.servings,
          sort_order: sortOrder,
        }))
      );
      if (error) throw error;
    }

    await fetchPresets();
  };

  // Delete a preset (items cascade deleted)
  const deletePreset = async (presetId: string): Promise<void> => {
    const { error } = await supabase
      .from("saved_meal_presets")
      .delete()
      .eq("id", presetId);

    if (error) throw error;
    setPresets((prev) => prev.filter((p) => p.id !== presetId));
  };

  return {
    presets,
    isLoading,
    error,
    savePreset,
    deletePreset,
    refetch: fetchPresets,
  };
}
