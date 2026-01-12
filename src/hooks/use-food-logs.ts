"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Food, FoodLog } from "@/lib/supabase/types";

export interface FoodLogWithFood extends FoodLog {
  food: Food;
}

export function useFoodLogs(date: string) {
  const [logs, setLogs] = useState<FoodLogWithFood[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("food_logs")
        .select(`
          *,
          food:foods (*)
        `)
        .eq("date", date)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setLogs((data as FoodLogWithFood[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch food logs");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const addLog = async (foodId: string, mealId: string, servings: number) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("food_logs")
        .insert({
          user_id: user.id,
          food_id: foodId,
          date,
          meal_id: mealId,
          servings,
        })
        .select(`
          *,
          food:foods (*)
        `)
        .single();

      if (error) throw error;
      setLogs((prev) => [...prev, data as FoodLogWithFood]);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add food log";
      setError(message);
      throw err;
    }
  };

  const updateLog = async (logId: string, servings: number) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("food_logs")
        .update({ servings })
        .eq("id", logId);

      if (error) throw error;
      setLogs((prev) =>
        prev.map((log) => (log.id === logId ? { ...log, servings } : log))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update food log";
      setError(message);
      throw err;
    }
  };

  const deleteLog = async (logId: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("food_logs")
        .delete()
        .eq("id", logId);

      if (error) throw error;
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete food log";
      setError(message);
      throw err;
    }
  };

  // Get logs filtered by meal id
  const getLogsByMealId = (mealId: string) => {
    return logs.filter((log) => log.meal_id === mealId);
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    addLog,
    updateLog,
    deleteLog,
    getLogsByMealId,
    refetch: fetchLogs,
  };
}
