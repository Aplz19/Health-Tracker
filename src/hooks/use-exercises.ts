"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Exercise, ExerciseInsert, ExerciseCategory } from "@/lib/supabase/types";

export function useExercises(searchQuery: string = "", category?: ExerciseCategory) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExercises = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("exercises")
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (searchQuery) {
        query = query.ilike("name", `%${searchQuery}%`);
      }

      if (category) {
        query = query.eq("category", category);
      }

      const { data, error } = await query;

      if (error) throw error;
      setExercises((data as Exercise[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch exercises");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, category]);

  const addExercise = async (exercise: ExerciseInsert) => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from("exercises")
        .insert(exercise)
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
