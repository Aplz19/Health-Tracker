"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Food, FoodLog } from "@/lib/supabase/types";

export interface FoodLogWithFood extends FoodLog {
  food: Food;
}

export function useFoodLogs(date: string) {
  const cacheKey = `food_logs:${date}`;
  const [logs, setLogsState] = useState<FoodLogWithFood[]>(
    () => getCached<FoodLogWithFood[]>(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter keeps the cache in sync with every state change.
  const setLogs = useCallback(
    (updater: React.SetStateAction<FoodLogWithFood[]>) => {
      setLogsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCached(cacheKey, next);
        return next;
      });
    },
    [cacheKey]
  );

  const fetchLogs = useCallback(async () => {
    if (!hasCached(cacheKey)) setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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
  }, [date, cacheKey, setLogs]);

  const addLog = async (foodId: string, mealId: string, servings: number) => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
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
    // On date change: swap in cached data instantly, then revalidate.
    const cached = getCached<FoodLogWithFood[]>(cacheKey);
    setLogsState(cached ?? []);
    setIsLoading(cached === undefined);
    fetchLogs();
  }, [cacheKey, fetchLogs]);

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
