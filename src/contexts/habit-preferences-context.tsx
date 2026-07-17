"use client";

import { createContext, useContext, ReactNode } from "react";
import { useHabits } from "@/hooks/use-habits";
import type { HabitPatch, NewHabitInput, ResolvedHabit } from "@/types/habits";

// Habits v2 context. Keeps the pre-v2 provider/hook names so the mount point
// (app/page.tsx) is unchanged, but exposes the unified ResolvedHabit
// interface backed by user_habits (or the legacy fallback - see use-habits).

interface HabitsContextType {
  isLoading: boolean;
  error: string | null;
  // True once the add_habits_v2.sql migration is applied: unlocks custom
  // habits, scale/choice kinds, emoji/name/unit edits, and archiving.
  v2Available: boolean;
  getAllHabits: () => ResolvedHabit[];
  getEnabledHabits: () => ResolvedHabit[];
  addHabit: (input: NewHabitInput) => Promise<string | null>;
  updateHabit: (key: string, patch: HabitPatch) => Promise<void>;
  toggleHabit: (key: string, enabled: boolean) => Promise<void>;
  archiveHabit: (key: string) => Promise<void>;
  reorderHabits: (orderedKeys: string[]) => Promise<void>;
  refetch: () => Promise<void>;
}

const HabitPreferencesContext = createContext<HabitsContextType | null>(null);

export function HabitPreferencesProvider({ children }: { children: ReactNode }) {
  const habits = useHabits();

  return (
    <HabitPreferencesContext.Provider value={habits}>
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
