"use client";

import { useState, useCallback } from "react";
import type { CachedWhoopWorkout } from "@/lib/supabase/types";

export function useWhoopWorkouts() {
  const [workouts, setWorkouts] = useState<CachedWhoopWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch cached workouts (optionally unlinked only)
  const fetchWorkouts = useCallback(async (options?: { date?: string; unlinkedOnly?: boolean }) => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (options?.date) params.set("date", options.date);
      if (options?.unlinkedOnly) params.set("unlinked", "true");

      const response = await fetch(`/api/whoop/workouts?${params}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to fetch workouts");
      }

      setWorkouts(result.data || []);
      return result.data || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch workouts";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync workouts from Whoop API
  const syncWorkouts = useCallback(async (days: number = 30) => {
    setIsSyncing(true);
    setError(null);
    try {
      const response = await fetch("/api/whoop/workouts/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to sync workouts");
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync workouts";
      setError(message);
      throw err;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    workouts,
    isLoading,
    isSyncing,
    error,
    fetchWorkouts,
    syncWorkouts,
  };
}
