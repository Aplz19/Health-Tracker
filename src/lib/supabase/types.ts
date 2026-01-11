export interface Food {
  id: string;
  name: string;
  serving_size: string;
  calories: number;
  protein: number;
  total_fat: number;
  saturated_fat: number | null;
  trans_fat: number | null;
  polyunsaturated_fat: number | null;
  monounsaturated_fat: number | null;
  sodium: number | null;
  total_carbohydrates: number;
  fiber: number | null;
  sugar: number | null;
  added_sugar: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
  vitamin_d: number | null;
  calcium: number | null;
  iron: number | null;
  created_at: string;
  updated_at: string;
}

export type FoodInsert = Omit<Food, "id" | "created_at" | "updated_at">;

export interface Meal {
  id: string;
  date: string;
  name: string;
  time_hour: number;
  time_minute: number;
  is_pm: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface FoodLog {
  id: string;
  food_id: string;
  date: string;
  meal_id: string;
  meal_type?: "breakfast" | "lunch" | "dinner" | "snack" | null; // deprecated
  servings: number;
  created_at: string;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack"; // kept for backwards compat

export type ExerciseCategory =
  | "biceps"
  | "triceps"
  | "chest"
  | "back"
  | "shoulders"
  | "quads"
  | "hamstrings"
  | "calves"
  | "forearms"
  | "abs";

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  created_at: string;
  updated_at: string;
}

export type ExerciseInsert = Omit<Exercise, "id" | "created_at" | "updated_at">;

export interface ExerciseLog {
  id: string;
  date: string;
  exercise_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExerciseSet {
  id: string;
  log_id: string;
  set_number: number;
  is_warmup: boolean;
  reps: number | null;
  weight: number | null;
  notes: string | null;
  created_at: string;
}

export interface TreadmillSession {
  id: string;
  date: string;
  duration_minutes: number;
  incline: number;
  speed: number;
  notes: string | null;
  created_at: string;
}

export type TreadmillSessionInsert = Omit<TreadmillSession, "id" | "created_at">;

// Re-export daily summary types for convenience
export type { DailySummary, DailySummaryData } from "@/lib/daily-summary/types";
