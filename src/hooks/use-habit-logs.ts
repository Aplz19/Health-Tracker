"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HabitLog } from "@/types/habits";

export function useHabitLogs(date: string, enabledHabitKeys: string[] = []) {
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef<string | null>(null);
  // Stabilize the keys for dependency comparison
  const keysString = enabledHabitKeys.join(",");

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date);

      if (error) throw error;
      const existingLogs = (data as HabitLog[]) || [];
      setLogs(existingLogs);

      // Auto-create "NO" records for enabled habits that don't have a log yet
      // Only do this once per date to avoid duplicate inserts
      const keys = keysString ? keysString.split(",") : [];
      if (keys.length > 0 && initializedRef.current !== date) {
        const existingKeys = new Set(existingLogs.map((l) => l.habit_key));
        const missingKeys = keys.filter((key) => !existingKeys.has(key));

        if (missingKeys.length > 0) {
          const newLogs = missingKeys.map((habit_key) => ({
            user_id: user.id,
            date,
            habit_key,
            completed: false,
            amount: null,
          }));

          const { data: insertedData, error: insertError } = await supabase
            .from("habit_logs")
            .insert(newLogs)
            .select();

          if (!insertError && insertedData) {
            setLogs((prev) => [...prev, ...(insertedData as HabitLog[])]);
          }
        }
        initializedRef.current = date;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch habit logs");
    } finally {
      setIsLoading(false);
    }
  }, [date, keysString]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Get log for a specific habit
  const getLogForHabit = useCallback((habitKey: string): HabitLog | undefined => {
    return logs.find((log) => log.habit_key === habitKey);
  }, [logs]);

  // Toggle completed status (for checkbox/goal modes)
  const toggleHabit = async (habitKey: string, amount: number | null = null): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existingLog = logs.find((l) => l.habit_key === habitKey);
      const newCompleted = !existingLog?.completed;

      // Optimistic update
      if (existingLog) {
        setLogs((prev) =>
          prev.map((l) =>
            l.habit_key === habitKey
              ? { ...l, completed: newCompleted, amount: newCompleted ? amount : null }
              : l
          )
        );
      } else {
        const tempLog: HabitLog = {
          id: `temp-${Date.now()}`,
          user_id: user.id,
          date,
          habit_key: habitKey,
          completed: true,
          amount,
          created_at: new Date().toISOString(),
        };
        setLogs((prev) => [...prev, tempLog]);
      }

      // Sync to database
      const { data, error } = await supabase
        .from("habit_logs")
        .upsert(
          {
            user_id: user.id,
            date,
            habit_key: habitKey,
            completed: newCompleted,
            amount: newCompleted ? amount : null,
          },
          { onConflict: "user_id,date,habit_key" }
        )
        .select()
        .single();

      if (error) throw error;

      // Update with real data
      if (data) {
        setLogs((prev) =>
          prev.map((l) =>
            l.habit_key === habitKey ? (data as HabitLog) : l
          )
        );
      }
    } catch (err) {
      await fetchLogs();
      throw err;
    }
  };

  // Update amount (for manual mode) - auto-sets completed=true if amount > 0
  const updateHabitAmount = async (habitKey: string, amount: number): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existingLog = logs.find((l) => l.habit_key === habitKey);
      const completed = amount > 0;

      // Optimistic update
      if (existingLog) {
        setLogs((prev) =>
          prev.map((l) =>
            l.habit_key === habitKey
              ? { ...l, completed, amount: amount > 0 ? amount : null }
              : l
          )
        );
      } else if (amount > 0) {
        const tempLog: HabitLog = {
          id: `temp-${Date.now()}`,
          user_id: user.id,
          date,
          habit_key: habitKey,
          completed: true,
          amount,
          created_at: new Date().toISOString(),
        };
        setLogs((prev) => [...prev, tempLog]);
      }

      // Sync to database
      const { data, error } = await supabase
        .from("habit_logs")
        .upsert(
          {
            user_id: user.id,
            date,
            habit_key: habitKey,
            completed,
            amount: amount > 0 ? amount : null,
          },
          { onConflict: "user_id,date,habit_key" }
        )
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setLogs((prev) =>
          prev.map((l) =>
            l.habit_key === habitKey ? (data as HabitLog) : l
          )
        );
      }
    } catch (err) {
      await fetchLogs();
      throw err;
    }
  };

  return {
    logs,
    isLoading,
    error,
    getLogForHabit,
    toggleHabit,
    updateHabitAmount,
    refetch: fetchLogs,
  };
}
