"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { Exercise, ExerciseInsert, ExerciseCategory } from "@/lib/supabase/types";

const EXERCISES_CACHE_KEY = "exercises";

export function useExercises(searchQuery: string = "", category?: ExerciseCategory) {
  // The full exercise list is fetched ONCE (and session-cached); search and
  // category filtering happen in memory. Previously every keystroke in the
  // exercise search re-queried Supabase.
  const [allExercises, setAllExercisesState] = useState<Exercise[]>(
    () => getCached<Exercise[]>(EXERCISES_CACHE_KEY) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(EXERCISES_CACHE_KEY));
  const [error, setError] = useState<string | null>(null);

  // Write-through setter keeps the session cache in sync.
  const setExercises = useCallback((updater: React.SetStateAction<Exercise[]>) => {
    setAllExercisesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCached(EXERCISES_CACHE_KEY, next);
      return next;
    });
  }, []);

  const fetchExercises = useCallback(async () => {
    if (!hasCached(EXERCISES_CACHE_KEY)) setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      setExercises((data as Exercise[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch exercises");
    } finally {
      setIsLoading(false);
    }
  }, [setExercises]);

  // In-memory filtering — instant, no network per keystroke.
  const exercises = useMemo(() => {
    let result = allExercises;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (category) {
      result = result.filter((e) => e.category === category);
    }
    return result;
  }, [allExercises, searchQuery, category]);

  const addExercise = async (exercise: Omit<ExerciseInsert, "user_id">) => {
    setError(null);
    try {
      // Get current user ID to associate exercise with them
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("exercises")
        .insert({ ...exercise, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      setExercises((prev) => [...prev, data as Exercise].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.name.localeCompare(b.name);
      }));
      return data as Exercise;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add exercise";
      setError(message);
      throw err;
    }
  };

  const updateExercise = async (id: string, updates: Partial<ExerciseInsert>) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("exercises")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      setExercises((prev) =>
        prev.map((ex) => (ex.id === id ? { ...ex, ...updates } : ex))
          .sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.name.localeCompare(b.name);
          })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update exercise";
      setError(message);
      throw err;
    }
  };

  const deleteExercise = async (id: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("exercises")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setExercises((prev) => prev.filter((ex) => ex.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete exercise";
      setError(message);
      throw err;
    }
  };

  const getExercisesByCategory = (cat: ExerciseCategory) => {
    return exercises.filter((ex) => ex.category === cat);
  };

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  return {
    exercises,
    isLoading,
    error,
    addExercise,
    updateExercise,
    deleteExercise,
    getExercisesByCategory,
    refetch: fetchExercises,
  };
}
