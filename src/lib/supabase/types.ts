export interface Food {
  id: string;
  name: string;
  serving_size: string;
  serving_size_grams: number | null;
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
  // Source tracking
  fdc_id: number | null;        // USDA FoodData Central ID (legacy)
  barcode: string | null;       // Barcode for scanned foods
  source: "manual" | "usda" | "openfoodfacts";  // Where this food came from
  created_at: string;
  updated_at: string;
}

export type FoodInsert = Omit<Food, "id" | "created_at" | "updated_at">;

// User's personal food library (favorites)
export interface UserFoodLibrary {
  id: string;
  user_id: string;
  food_id: string;
  added_at: string;
}

export interface Meal {
  id: string;
  user_id: string;
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
  user_id: string;
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
  user_id: string | null; // null = preset, string = user-created
  created_at: string;
  updated_at: string;
}

export type ExerciseInsert = Omit<Exercise, "id" | "created_at" | "updated_at">;

export interface ExerciseLog {
  id: string;
  user_id: string;
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

// Cardio exercise types - stored in treadmill_sessions.exercise_type column
export type CardioExerciseType = "treadmill" | "treadmill_backwards";

export const CARDIO_EXERCISES: { type: CardioExerciseType; name: string }[] = [
  { type: "treadmill", name: "Treadmill" },
  { type: "treadmill_backwards", name: "Treadmill Backwards Walking" },
];

export interface TreadmillSession {
  id: string;
  user_id: string;
  date: string;
  exercise_type: CardioExerciseType;
  duration_minutes: number;
  incline: number;
  speed: number;
  notes: string | null;
  created_at: string;
}

export interface WhoopData {
  id: string;
  user_id: string;
  date: string;
  cycle_id: number | null;
  recovery_score: number | null;
  hrv_rmssd: number | null;
  resting_heart_rate: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  sleep_id: string | null;
  sleep_score: number | null;
  sleep_duration_minutes: number | null;
  strain_score: number | null;
  kilojoules: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type TreadmillSessionInsert = Omit<TreadmillSession, "id" | "created_at">;

// Re-export daily summary types for convenience
export type { DailySummary, DailySummaryData } from "@/lib/daily-summary/types";
