"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

// localStorage is kept only as an instant cache + offline/pre-migration
// fallback. The source of truth is the `user_nutrition_goals` table so goals
// sync across every device the user signs in on.
const STORAGE_KEY = "health-tracker-nutrition-goals";

export interface NutritionGoals {
  calories: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
}

export interface CalculatedGoals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

const DEFAULT_GOALS: NutritionGoals = {
  calories: 2000,
  proteinPercent: 30,
  carbsPercent: 40,
  fatPercent: 30,
};

// Protein & carbs = 4 cal/g, fat = 9 cal/g
export function calculateGrams(goals: NutritionGoals): CalculatedGoals {
  const proteinCals = goals.calories * (goals.proteinPercent / 100);
  const carbsCals = goals.calories * (goals.carbsPercent / 100);
  const fatCals = goals.calories * (goals.fatPercent / 100);

  return {
    calories: goals.calories,
    protein: Math.round(proteinCals / 4),
    carbs: Math.round(carbsCals / 4),
    fat: Math.round(fatCals / 9),
  };
}

interface NutritionGoalsRow {
  calories: number;
  protein_percent: number;
  carbs_percent: number;
  fat_percent: number;
}

function rowToGoals(row: NutritionGoalsRow): NutritionGoals {
  return {
    calories: row.calories,
    proteinPercent: row.protein_percent,
    carbsPercent: row.carbs_percent,
    fatPercent: row.fat_percent,
  };
}

function readLocal(): NutritionGoals | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_GOALS, ...JSON.parse(stored) };
  } catch {
    // ignore
  }
  return null;
}

function writeLocal(goals: NutritionGoals) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch {
    // ignore
  }
}

function upsertGoals(userId: string, goals: NutritionGoals) {
  return supabase.from("user_nutrition_goals").upsert(
    {
      user_id: userId,
      calories: goals.calories,
      protein_percent: goals.proteinPercent,
      carbs_percent: goals.carbsPercent,
      fat_percent: goals.fatPercent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

export function useNutritionGoals() {
  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // 1) Seed instantly from the local cache so the UI never flashes defaults.
    const local = readLocal();
    if (local) setGoals(local);

    // 2) Load the authoritative per-user goals from Supabase.
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from("user_nutrition_goals")
          .select("calories, protein_percent, carbs_percent, fat_percent")
          .eq("user_id", user.id)
          .single();

        if (cancelled) return;

        if (!error && data) {
          // Server wins — this is what keeps devices in sync.
          const dbGoals = rowToGoals(data as NutritionGoalsRow);
          setGoals(dbGoals);
          writeLocal(dbGoals);
        } else if (error && error.code === "PGRST116" && local) {
          // No row yet but the user has local goals from the old
          // localStorage-only version — migrate them so they persist + sync.
          await upsertGoals(user.id, local);
        }
        // Any other error (e.g. table not created yet) intentionally falls
        // through and keeps the local/default goals — no breakage.
      } catch {
        // Network/auth failure — keep local/default goals.
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveGoals = useCallback((newGoals: NutritionGoals) => {
    // Optimistic: update UI + cache immediately.
    setGoals(newGoals);
    writeLocal(newGoals);

    // Persist per-user in the background (best effort).
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;
        const { error } = await upsertGoals(user.id, newGoals);
        if (error) console.error("Failed to save nutrition goals:", error);
      } catch (err) {
        console.error("Failed to save nutrition goals:", err);
      }
    })();
  }, []);

  const calculatedGoals = calculateGrams(goals);

  return {
    goals,
    calculatedGoals,
    saveGoals,
    isLoaded,
  };
}
