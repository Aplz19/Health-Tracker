"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { Food, FoodInsert } from "@/lib/supabase/types";

export function useFoods(searchQuery: string = "") {
  const [foods, setFoods] = useState<Food[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFoods = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from("foods")
        .select("*")
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.ilike("name", `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setFoods(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch foods");
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  const addFood = async (food: FoodInsert) => {
    setIsAdding(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("foods")
        .insert(food)
        .select()
        .single();

      if (error) throw error;
      setFoods((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add food";
      setError(message);
      throw err;
    } finally {
      setIsAdding(false);
    }
  };

  const updateFood = async (id: string, food: FoodInsert) => {
    setError(null);
    try {
      const { data, error } = await supabase
        .from("foods")
        .update(food)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      setFoods((prev) => prev.map((f) => (f.id === id ? data : f)));
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update food";
      setError(message);
      throw err;
    }
  };

  const deleteFood = async (id: string) => {
    setError(null);
    try {
      const { error } = await supabase.from("foods").delete().eq("id", id);
      if (error) throw error;
      setFoods((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete food";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  return {
    foods,
    isLoading,
    isAdding,
    error,
    addFood,
    updateFood,
    deleteFood,
    refetch: fetchFoods,
  };
}
