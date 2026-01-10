"use client";

import { useState, useEffect, useCallback } from "react";

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

export function useNutritionGoals() {
  const [goals, setGoals] = useState<NutritionGoals>(DEFAULT_GOALS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGoals({ ...DEFAULT_GOALS, ...parsed });
      }
    } catch {
      // Use defaults if localStorage fails
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  const saveGoals = useCallback((newGoals: NutritionGoals) => {
    setGoals(newGoals);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newGoals));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const calculatedGoals = calculateGrams(goals);

  return {
    goals,
    calculatedGoals,
    saveGoals,
    isLoaded,
  };
}
