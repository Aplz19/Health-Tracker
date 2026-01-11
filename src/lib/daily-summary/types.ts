// Daily Summary Types - Aggregated data structure for AI analysis

export interface DailySummaryTotals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  fiber: number | null;
  sugar: number | null;
  sodium: number | null;
  saturated_fat: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
  vitamin_d: number | null;
  calcium: number | null;
  iron: number | null;
}

export interface MealFoodItem {
  food_id: string;
  name: string;
  serving_size: string;
  servings: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MealSummary {
  meal_id: string;
  name: string;
  time: string; // formatted as "8:30 AM"
  time_hour: number;
  time_minute: number;
  is_pm: boolean;
  foods: MealFoodItem[];
  meal_totals: {
    calories: number;
    protein: number;
    fat: number;
    carbs: number;
  };
}

export interface SupplementsSummary {
  creatine: number;
  d3: number;
  k2: number;
  vitamin_c: number;
  zinc: number;
  magnesium: number;
  melatonin: number;
  caffeine: number;
}

export interface ExerciseSetSummary {
  set_number: number;
  is_warmup: boolean;
  reps: number | null;
  weight: number | null;
  notes: string | null;
}

export interface ExerciseSummary {
  exercise_id: string;
  name: string;
  category: string;
  sets: ExerciseSetSummary[];
  total_sets: number;
  total_reps: number;
  max_weight: number | null;
}

export interface TreadmillSummary {
  session_id: string;
  duration_minutes: number;
  incline: number;
  speed: number;
  notes: string | null;
}

export interface WorkoutSummary {
  exercises: ExerciseSummary[];
  treadmill: TreadmillSummary[];
  total_exercises: number;
  total_sets: number;
  total_cardio_minutes: number;
}

export interface WhoopSummary {
  recovery_score: number | null;
  hrv_rmssd: number | null;
  resting_heart_rate: number | null;
  spo2_percentage: number | null;
  skin_temp_celsius: number | null;
  sleep_score: number | null;
  sleep_duration_minutes: number | null;
  strain_score: number | null;
  kilojoules: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
}

export interface DailySummaryData {
  date: string;
  totals: DailySummaryTotals;
  meals: MealSummary[];
  supplements: SupplementsSummary;
  workout: WorkoutSummary;
  whoop: WhoopSummary | null;
}

export interface DailySummary {
  id: string;
  date: string;
  data: DailySummaryData;
  created_at: string;
  updated_at: string;
}
