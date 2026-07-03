"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Meal } from "@/lib/supabase/types";

export function useMeals(date: string) {
  const cacheKey = `meals:${date}`;
  const [meals, setMealsState] = useState<Meal[]>(() => getCached<Meal[]>(cacheKey) ?? []);
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter: keeps the cache in sync with every state change so
  // mutations survive tab switches / date changes without a refetch.
  const setMeals = useCallback(
    (updater: React.SetStateAction<Meal[]>) => {
      setMealsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCached(cacheKey, next);
        return next;
      });
    },
    [cacheKey]
  );

  const fetchMeals = useCallback(async () => {
    // Only block the UI when there's nothing cached to show; otherwise this
    // is a silent background revalidation (stale-while-revalidate).
    if (!hasCached(cacheKey)) setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("meals")
        .select("*")
        .eq("date", date)
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setMeals((data as Meal[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch meals");
    } finally {
      setIsLoading(false);
    }
  }, [date, cacheKey, setMeals]);

  const addMeal = async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const nextOrder = meals.length;
      const nextName = `Meal ${meals.length + 1}`;

      // Default to current time
      const now = new Date();
      let hour = now.getHours();
      const minute = now.getMinutes();
      const isPm = hour >= 12;
      if (hour > 12) hour -= 12;
      if (hour === 0) hour = 12;

      const { data, error } = await supabase
        .from("meals")
        .insert({
          user_id: user.id,
          date,
          name: nextName,
          time_hour: hour,
          time_minute: minute,
          is_pm: isPm,
          sort_order: nextOrder,
        })
        .select()
        .single();

      if (error) throw error;
      setMeals((prev) => [...prev, data as Meal]);
      return data as Meal;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add meal";
      setError(message);
      throw err;
    }
  };

  const updateMeal = async (
    mealId: string,
    updates: Partial<Pick<Meal, "name" | "time_hour" | "time_minute" | "is_pm">>
  ) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("meals")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", mealId);

      if (error) throw error;
      setMeals((prev) =>
        prev.map((meal) =>
          meal.id === mealId ? { ...meal, ...updates } : meal
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update meal";
      setError(message);
      throw err;
    }
  };

  const deleteMeal = async (mealId: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("meals")
        .delete()
        .eq("id", mealId);

      if (error) throw error;
      setMeals((prev) => prev.filter((meal) => meal.id !== mealId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete meal";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    // On date change: swap in that date's cached data instantly (or empty +
    // loading if never seen), then revalidate in the background.
    const cached = getCached<Meal[]>(cacheKey);
    setMealsState(cached ?? []);
    setIsLoading(cached === undefined);
    fetchMeals();
  }, [cacheKey, fetchMeals]);

  return {
    meals,
    isLoading,
    error,
    addMeal,
    updateMeal,
    deleteMeal,
    refetch: fetchMeals,
  };
}
