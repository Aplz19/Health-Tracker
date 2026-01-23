"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { HabitLog } from "@/types/habits";

export function useHabitLogs(date: string) {
  const [logs, setLogs] = useState<HabitLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setLogs((data as HabitLog[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch habit logs");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Get log for a specific habit
  const getLogForHabit = useCallback((habitKey: string): HabitLog | undefined => {
    return logs.find((log) => log.habit_key === habitKey);
  }, [logs]);

  // Update or create log for a habit - OPTIMISTIC UPDATE
  const updateHabitLog = async (habitKey: string, amount: number): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const existingLog = logs.find((l) => l.habit_key === habitKey);

      if (amount === 0 && existingLog) {
        // Delete the log if amount is 0
        setLogs((prev) => prev.filter((l) => l.habit_key !== habitKey));

        await supabase
          .from("habit_logs")
          .delete()
          .eq("id", existingLog.id);
      } else if (amount > 0) {
        // Optimistic update
        if (existingLog) {
          setLogs((prev) =>
            prev.map((l) =>
              l.habit_key === habitKey ? { ...l, amount } : l
            )
          );
        } else {
          // Add temporary log
          const tempLog: HabitLog = {
            id: `temp-${Date.now()}`,
            user_id: user.id,
            date,
            habit_key: habitKey,
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
              amount,
            },
            { onConflict: "user_id,date,habit_key" }
          )
          .select()
          .single();

        if (error) throw error;

        // Update with real ID
        if (data) {
          setLogs((prev) =>
            prev.map((l) =>
              l.habit_key === habitKey ? (data as HabitLog) : l
            )
          );
        }
      }
    } catch (err) {
      // Refetch on error to restore state
      await fetchLogs();
      throw err;
    }
  };

  // Toggle habit (for checkbox mode) - sets to goal amount or 0
  const toggleHabit = async (habitKey: string, goalAmount: number): Promise<void> => {
    const existingLog = logs.find((l) => l.habit_key === habitKey);
    const newAmount = existingLog && existingLog.amount > 0 ? 0 : goalAmount;
    await updateHabitLog(habitKey, newAmount);
  };

  return {
    logs,
    isLoading,
    error,
    getLogForHabit,
    updateHabitLog,
    toggleHabit,
    refetch: fetchLogs,
  };
}
