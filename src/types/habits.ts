import type { LucideIcon } from "lucide-react";

// Static habit definition (never changes)
export interface HabitDefinition {
  key: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  color: string;
  defaultGoal: number;
  step?: number;
}

// User's preference for a habit (stored in database)
export interface HabitPreference {
  id?: string;
  user_id: string;
  habit_key: string;
  is_enabled: boolean;
  tracking_mode: "checkbox" | "goal" | "manual";
  goal_amount: number | null;
  sort_order: number;
}

// Combined: definition + user preference
export interface UserHabit {
  definition: HabitDefinition;
  preference: HabitPreference | null;
  isEnabled: boolean;
  trackingMode: "checkbox" | "goal" | "manual";
  goalAmount: number;
  sortOrder: number;
}

// Daily habit log entry
export interface HabitLog {
  id: string;
  user_id: string;
  date: string;
  habit_key: string;
  completed: boolean;
  amount: number | null; // null for checkbox mode, number for goal/manual
  created_at: string;
}

export type HabitLogInsert = Omit<HabitLog, "id" | "created_at">;
