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

/**
 * One tracked item taken on a day — supplement or medication, in its own unit.
 * This is the complete picture; `SupplementsSummary` below is the legacy
 * fixed-key subset, kept so pre-migration summaries stay comparable.
 */
export interface TrackedItemSummaryEntry {
  name: string;
  kind: "supplement" | "medication";
  unit: string;
  /** Amount actually taken that day. Never recomputed from current settings. */
  amount: number;
  doses_taken: number;
  doses_per_day: number;
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

  // Sub-metrics promoted out of `whoop_data.raw_data`, where the sync has been
  // archiving them all along. They were reachable from the UI but invisible to
  // anything reading daily_summaries -- i.e. to all analysis. Durations are
  // minutes, matching sleep_duration_minutes. See src/lib/whoop/raw.ts.
  sleep_light_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_in_bed_minutes: number | null;
  sleep_no_data_minutes: number | null;
  sleep_cycle_count: number | null;
  sleep_disturbance_count: number | null;
  sleep_efficiency_percentage: number | null;
  sleep_consistency_percentage: number | null;
  respiratory_rate: number | null;
  sleep_needed_baseline_minutes: number | null;
  sleep_needed_from_debt_minutes: number | null;
  sleep_needed_from_strain_minutes: number | null;
  sleep_needed_from_nap_minutes: number | null;
  /** Sleep onset/offset -- the missing input for meal-to-sleep analysis. */
  sleep_start: string | null;
  sleep_end: string | null;
  is_nap: boolean | null;
  user_calibrating: boolean | null;
}

// Habits v2. One entry per ENABLED habit; `value` is null when nothing was
// logged that day (sparse truth - unlogged is NA, never zero/false, so
// downstream analytics must exclude nulls instead of treating them as 0).
export interface HabitSummaryEntry {
  habit_key: string;
  name: string;
  kind: "checkbox" | "number" | "scale" | "choice";
  unit: string;
  goal: number | null;
  logged: boolean;
  value: boolean | number | string | null;
}

export interface DailySummaryData {
  date: string;
  totals: DailySummaryTotals;
  meals: MealSummary[];
  supplements: SupplementsSummary;
  /**
   * Every supplement and medication logged that day, including custom ones.
   * Absent on summaries generated before the tracked-items migration.
   */
  tracked?: TrackedItemSummaryEntry[];
  workout: WorkoutSummary;
  whoop: WhoopSummary | null;
  // Optional: absent on summaries generated before habits v2.
  habits?: HabitSummaryEntry[];
  day_note?: string | null;
  /**
   * Per-day nutrition data-quality flag. Absent/null means the day was tracked
   * normally; "incomplete" means the user marked it untrustworthy (partial or
   * un-estimable logging). Analysis should exclude non-null days from
   * nutrition averages and correlations by default, and say so in its output.
   * Nutrition only — sleep/recovery/workout data for the same day is still
   * valid and should be kept.
   */
  nutrition_quality?: "incomplete" | "estimated" | null;
}

export interface DailySummary {
  id: string;
  date: string;
  data: DailySummaryData;
  created_at: string;
  updated_at: string;
}
