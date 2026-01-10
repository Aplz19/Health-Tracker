"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Meal } from "@/lib/supabase/types";

export function useMeals(date: string) {
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("meals")
        .select("*")
        .eq("date", date)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setMeals((data as Meal[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch meals");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const addMeal = async () => {
    setError(null);
    try {
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
    fetchMeals();
  }, [fetchMeals]);

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
