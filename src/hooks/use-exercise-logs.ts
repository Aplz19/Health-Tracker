"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { ExerciseLog, ExerciseSet, Exercise } from "@/lib/supabase/types";

export interface ExerciseLogWithDetails extends ExerciseLog {
  exercise: Exercise;
  sets: ExerciseSet[];
}

// Re-export for backwards compatibility
export type ExerciseSetWithDetails = ExerciseSet;

export function useExerciseLogs(date: string) {
  const [logs, setLogs] = useState<ExerciseLogWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("exercise_logs")
        .select(`
          *,
          exercise:exercises (*),
          sets:exercise_sets (*)
        `)
        .eq("date", date)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Sort sets by set_number within each log
      const logsWithSortedSets = (data || []).map((log: ExerciseLogWithDetails) => ({
        ...log,
        sets: (log.sets || []).sort((a: ExerciseSet, b: ExerciseSet) => a.set_number - b.set_number),
      }));

      setLogs(logsWithSortedSets as ExerciseLogWithDetails[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch exercise logs");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  // Add a new exercise log (creates the log + first set)
  const addLog = async (exerciseId: string, sessionId?: string) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create the exercise log
      const { data: logData, error: logError } = await supabase
        .from("exercise_logs")
        .insert({
          user_id: user.id,
          date,
          exercise_id: exerciseId,
          session_id: sessionId || null,
        })
        .select(`
          *,
          exercise:exercises (*)
        `)
        .single();

      if (logError) throw logError;

      // Create the first set
      const { data: setData, error: setError } = await supabase
        .from("exercise_sets")
        .insert({
          log_id: logData.id,
          set_number: 1,
          is_warmup: false,
        })
        .select()
        .single();

      if (setError) throw setError;

      const newLog: ExerciseLogWithDetails = {
        ...logData,
        sets: [setData],
      };

      setLogs((prev) => [...prev, newLog]);
      return newLog;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add exercise log";
      setError(message);
      throw err;
    }
  };

  // Delete an exercise log
  const deleteLog = async (logId: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("exercise_logs")
        .delete()
        .eq("id", logId);

      if (error) throw error;
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete exercise log";
      setError(message);
      throw err;
    }
  };

  // Add a new set to an exercise log
  const addSet = async (logId: string) => {
    setError(null);
    try {
      const log = logs.find((l) => l.id === logId);
      if (!log) throw new Error("Log not found");

      const nextSetNumber = log.sets.length + 1;

      const { data, error } = await supabase
        .from("exercise_sets")
        .insert({
          log_id: logId,
          set_number: nextSetNumber,
          is_warmup: false,
        })
        .select()
        .single();

      if (error) throw error;

      setLogs((prev) =>
        prev.map((l) =>
          l.id === logId
            ? { ...l, sets: [...l.sets, data as ExerciseSetWithDetails] }
            : l
        )
      );
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add set";
      setError(message);
      throw err;
    }
  };

  // Update a set
  const updateSet = async (
    setId: string,
    updates: Partial<Pick<ExerciseSet, "is_warmup" | "reps" | "weight" | "notes">>
  ) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("exercise_sets")
        .update(updates)
        .eq("id", setId);

      if (error) throw error;

      setLogs((prev) =>
        prev.map((log) => ({
          ...log,
          sets: log.sets.map((set) =>
            set.id === setId ? { ...set, ...updates } : set
          ),
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update set";
      setError(message);
      throw err;
    }
  };

  // Delete a set
  const deleteSet = async (logId: string, setId: string) => {
    setError(null);
    try {
      const log = logs.find((l) => l.id === logId);
      if (!log) throw new Error("Log not found");

      // If this is the last set, delete the whole log
      if (log.sets.length <= 1) {
        await deleteLog(logId);
        return;
      }

      const { error } = await supabase
        .from("exercise_sets")
        .delete()
        .eq("id", setId);

      if (error) throw error;

      // Update set numbers for remaining sets
      const remainingSets = log.sets
        .filter((s) => s.id !== setId)
        .map((s, idx) => ({ ...s, set_number: idx + 1 }));

      // Update set numbers in database (only for sets that need renumbering)
      const updatePromises = remainingSets
        .filter((set, idx) => {
          const originalSet = log.sets.find((s) => s.id === set.id);
          return originalSet && originalSet.set_number !== idx + 1;
        })
        .map((set) =>
          supabase
            .from("exercise_sets")
            .update({ set_number: set.set_number })
            .eq("id", set.id)
        );

      await Promise.all(updatePromises);

      setLogs((prev) =>
        prev.map((l) =>
          l.id === logId ? { ...l, sets: remainingSets } : l
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete set";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    addLog,
    deleteLog,
    addSet,
    updateSet,
    deleteSet,
    refetch: fetchLogs,
  };
}
