"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Food, SavedMealPreset, SavedMealPresetItem } from "@/lib/supabase/types";

// Preset with joined food data
export interface SavedMealPresetWithItems extends SavedMealPreset {
  items: Array<SavedMealPresetItem & { food: Food }>;
}

export function useSavedMealPresets() {
  const [presets, setPresets] = useState<SavedMealPresetWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPresets = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch presets with their items and food data
      const { data, error } = await supabase
        .from("saved_meal_presets")
        .select(
          `
          *,
          items:saved_meal_preset_items (
            *,
            food:foods (*)
          )
        `
        )
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;

      // Sort items within each preset by sort_order
      const sorted = (data || []).map((preset) => ({
        ...preset,
        items: preset.items.sort(
          (a: SavedMealPresetItem, b: SavedMealPresetItem) =>
            a.sort_order - b.sort_order
        ),
      }));

      setPresets(sorted as SavedMealPresetWithItems[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch presets");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  // Create a new preset
  const createPreset = async (name: string): Promise<SavedMealPreset> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("saved_meal_presets")
      .insert({ user_id: user.id, name })
      .select()
      .single();

    if (error) throw error;
    await fetchPresets();
    return data as SavedMealPreset;
  };

  // Update preset name
  const updatePreset = async (presetId: string, name: string): Promise<void> => {
    const { error } = await supabase
      .from("saved_meal_presets")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", presetId);

    if (error) throw error;
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

  // Add food to a preset
  const addItemToPreset = async (
    presetId: string,
    foodId: string,
    servings: number
  ): Promise<void> => {
    const preset = presets.find((p) => p.id === presetId);
    const sortOrder = preset ? preset.items.length : 0;

    const { error } = await supabase.from("saved_meal_preset_items").insert({
      preset_id: presetId,
      food_id: foodId,
      servings,
      sort_order: sortOrder,
    });

    if (error) throw error;
    await fetchPresets();
  };

  // Update item servings in a preset
  const updateItemServings = async (
    itemId: string,
    servings: number
  ): Promise<void> => {
    const { error } = await supabase
      .from("saved_meal_preset_items")
      .update({ servings })
      .eq("id", itemId);

    if (error) throw error;
    await fetchPresets();
  };

  // Remove item from a preset
  const removeItemFromPreset = async (itemId: string): Promise<void> => {
    const { error } = await supabase
      .from("saved_meal_preset_items")
      .delete()
      .eq("id", itemId);

    if (error) throw error;
    await fetchPresets();
  };

  return {
    presets,
    isLoading,
    error,
    createPreset,
    updatePreset,
    deletePreset,
    addItemToPreset,
    updateItemServings,
    removeItemFromPreset,
    refetch: fetchPresets,
  };
}
