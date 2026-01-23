"use client";

import { createContext, useContext, ReactNode } from "react";
import { useHabitPreferences } from "@/hooks/use-habit-preferences";
import type { HabitPreference, UserHabit } from "@/types/habits";

interface HabitPreferencesContextType {
  preferences: HabitPreference[];
  isLoading: boolean;
  error: string | null;
  getAllHabits: () => UserHabit[];
  getEnabledHabits: () => UserHabit[];
  toggleHabit: (key: string, enabled: boolean) => Promise<void>;
  setTrackingMode: (key: string, mode: "checkbox" | "goal" | "manual") => Promise<void>;
  setGoalAmount: (key: string, amount: number) => Promise<void>;
  reorderHabits: (orderedKeys: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const HabitPreferencesContext = createContext<HabitPreferencesContextType | null>(null);

export function HabitPreferencesProvider({ children }: { children: ReactNode }) {
  const habitPreferences = useHabitPreferences();

  return (
    <HabitPreferencesContext.Provider value={habitPreferences}>
      {children}
    </HabitPreferencesContext.Provider>
  );
}

export function useHabitPreferencesContext() {
  const context = useContext(HabitPreferencesContext);
  if (!context) {
    throw new Error(
      "useHabitPreferencesContext must be used within HabitPreferencesProvider"
    );
  }
  return context;
}
