"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { HABIT_DEFINITIONS } from "@/lib/habits/config";
import type { HabitPreference, UserHabit } from "@/types/habits";

export function useHabitPreferences() {
  const [preferences, setPreferences] = useState<HabitPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Initial fetch only
  useEffect(() => {
    const fetchPreferences = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        setUserId(user.id);

        const { data, error } = await supabase
          .from("user_habit_preferences")
          .select("*")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });

        if (error) throw error;
        setPreferences((data as HabitPreference[]) || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch preferences");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  // Get all habits with their preferences (for settings)
  const getAllHabits = useCallback((): UserHabit[] => {
    return HABIT_DEFINITIONS.map((definition) => {
      const pref = preferences.find((p) => p.habit_key === definition.key);
      return {
        definition,
        preference: pref || null,
        isEnabled: pref?.is_enabled ?? false,
        trackingMode: pref?.tracking_mode ?? "checkbox",
        goalAmount: pref?.goal_amount ?? definition.defaultGoal,
        sortOrder: pref?.sort_order ?? 999,
      };
    });
  }, [preferences]);

  // Get only enabled habits sorted by order (for habits tab)
  const getEnabledHabits = useCallback((): UserHabit[] => {
    return getAllHabits()
      .filter((h) => h.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [getAllHabits]);

  // Toggle habit enabled/disabled - OPTIMISTIC UPDATE
  const toggleHabit = async (key: string, enabled: boolean): Promise<void> => {
    if (!userId) return;

    const definition = HABIT_DEFINITIONS.find((h) => h.key === key);
    if (!definition) throw new Error("Unknown habit");

    // Get current max sort order for new enabled habits
    const maxOrder = Math.max(0, ...preferences.map((p) => p.sort_order));
    const newSortOrder = enabled ? maxOrder + 1 : 999;

    // Optimistic update - update local state immediately
    setPreferences((prev) => {
      const existing = prev.find((p) => p.habit_key === key);
      if (existing) {
        return prev.map((p) =>
          p.habit_key === key
            ? { ...p, is_enabled: enabled, sort_order: newSortOrder }
            : p
        );
      } else {
        // Add new preference
        return [
          ...prev,
          {
            user_id: userId,
            habit_key: key,
            is_enabled: enabled,
            tracking_mode: "checkbox" as const,
            goal_amount: definition.defaultGoal,
            sort_order: newSortOrder,
          },
        ];
      }
    });

    // Sync to database in background (no await, no refetch)
    supabase
      .from("user_habit_preferences")
      .upsert(
        {
          user_id: userId,
          habit_key: key,
          is_enabled: enabled,
          tracking_mode: "checkbox",
          goal_amount: definition.defaultGoal,
          sort_order: newSortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,habit_key" }
      )
      .then(({ error }) => {
        if (error) console.error("Failed to sync toggle:", error);
      });
  };

  // Set tracking mode for a habit - OPTIMISTIC UPDATE
  const setTrackingMode = async (key: string, mode: "checkbox" | "goal" | "manual"): Promise<void> => {
    if (!userId) return;

    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) =>
        p.habit_key === key ? { ...p, tracking_mode: mode } : p
      )
    );

    // Sync to database in background
    supabase
      .from("user_habit_preferences")
      .update({ tracking_mode: mode, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("habit_key", key)
      .then(({ error }) => {
        if (error) console.error("Failed to sync tracking mode:", error);
      });
  };

  // Set goal amount for a habit - OPTIMISTIC UPDATE
  const setGoalAmount = async (key: string, amount: number): Promise<void> => {
    if (!userId) return;

    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) =>
        p.habit_key === key ? { ...p, goal_amount: amount } : p
      )
    );

    // Sync to database in background
    supabase
      .from("user_habit_preferences")
      .update({ goal_amount: amount, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("habit_key", key)
      .then(({ error }) => {
        if (error) console.error("Failed to sync goal amount:", error);
      });
  };

  // Reorder habits - OPTIMISTIC UPDATE
  const reorderHabits = async (orderedKeys: string[]): Promise<void> => {
    if (!userId) return;

    // Optimistic update - update all sort orders immediately
    setPreferences((prev) =>
      prev.map((p) => {
        const newIndex = orderedKeys.indexOf(p.habit_key);
        return newIndex >= 0 ? { ...p, sort_order: newIndex } : p;
      })
    );

    // Sync to database in background
    const updates = orderedKeys.map((key, index) =>
      supabase
        .from("user_habit_preferences")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("habit_key", key)
    );

    Promise.all(updates).then((results) => {
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) console.error("Failed to sync reorder:", errors);
    });
  };

  // Manual refetch if needed
  const refetch = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("user_habit_preferences")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setPreferences(data as HabitPreference[]);
    }
  };

  return {
    preferences,
    isLoading,
    error,
    getAllHabits,
    getEnabledHabits,
    toggleHabit,
    setTrackingMode,
    setGoalAmount,
    reorderHabits,
    refetch,
  };
}
