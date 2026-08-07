import { getServerSupabase } from "@/lib/supabase/server";
import {
  enabledSorted,
  interpretLog,
  isMissingSchemaError,
  resolveFromLegacy,
  resolveFromV2,
} from "@/lib/habits/logic";
import type { HabitLog, HabitPreference, UserHabitRow } from "@/types/habits";
import type {
  DailySummaryData,
  DailySummaryTotals,
  MealSummary,
  MealFoodItem,
  SupplementsSummary,
  TrackedItemSummaryEntry,
  WorkoutSummary,
  ExerciseSummary,
  TreadmillSummary,
  WhoopSummary,
  HabitSummaryEntry,
} from "./types";

// Format time as "8:30 AM"
function formatTime(hour: number, minute: number, isPm: boolean): string {
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = minute.toString().padStart(2, "0");
  const period = isPm ? "PM" : "AM";
  return `${displayHour}:${displayMinute} ${period}`;
}

// Fetch and aggregate all data for a specific date and user
export async function aggregateDailyData(date: string, userId: string): Promise<DailySummaryData> {
  const supabase = getServerSupabase();

  // Fetch only this user's rows for the selected day. Catalog lookups happen
  // in a second, ID-scoped phase so summary generation never downloads every
  // food, exercise, and set in the database.
  const [
    mealsResult,
    foodLogsResult,
    trackedResult,
    exerciseLogsResult,
    treadmillResult,
    whoopResult,
  ] = await Promise.all([
    supabase.from("meals").select("*").eq("date", date).eq("user_id", userId).order("time_hour").order("time_minute"),
    supabase.from("food_logs").select("*").eq("date", date).eq("user_id", userId),
    // Supplements AND medications, from the generic tracked-item tables that
    // replaced the 15 one-table-per-supplement designs.
    supabase
      .from("tracked_item_logs")
      .select(
        "amount, doses_taken, item:user_tracked_items ( name, kind, unit, doses_per_day, legacy_key )"
      )
      .eq("date", date)
      .eq("user_id", userId),
    supabase.from("exercise_logs").select("*").eq("date", date).eq("user_id", userId),
    supabase.from("treadmill_sessions").select("*").eq("date", date).eq("user_id", userId),
    supabase.from("whoop_data").select("*").eq("date", date).eq("user_id", userId).single(),
  ]);

  const meals = mealsResult.data || [];
  const foodLogs = foodLogsResult.data || [];
  const exerciseLogs = exerciseLogsResult.data || [];
  const treadmillSessions = treadmillResult.data || [];

  const foodIds = [...new Set(foodLogs.map((log) => log.food_id))];
  const exerciseLogIds = exerciseLogs.map((log) => log.id);
  const exerciseIds = [...new Set(exerciseLogs.map((log) => log.exercise_id))];

  const [foodsResult, exerciseSetsResult, exercisesResult] = await Promise.all([
    foodIds.length > 0
      ? supabase
          .from("foods")
          .select(
            "id, name, serving_size, calories, protein, total_fat, total_carbohydrates, fiber, sugar, sodium, saturated_fat, vitamin_a, vitamin_c, vitamin_d, calcium, iron"
          )
          .in("id", foodIds)
      : Promise.resolve({ data: [], error: null }),
    exerciseLogIds.length > 0
      ? supabase
          .from("exercise_sets")
          .select("id, log_id, set_number, is_warmup, reps, weight, notes")
          .in("log_id", exerciseLogIds)
      : Promise.resolve({ data: [], error: null }),
    exerciseIds.length > 0
      ? supabase.from("exercises").select("id, name, category").in("id", exerciseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const foods = foodsResult.data || [];
  const exerciseSets = exerciseSetsResult.data || [];
  const exercises = exercisesResult.data || [];

  // Create lookup maps
  const foodsMap = new Map(foods.map((f) => [f.id, f]));
  const exercisesMap = new Map(exercises.map((e) => [e.id, e]));

  // Build meals with foods
  const mealSummaries: MealSummary[] = meals.map((meal) => {
    const mealFoodLogs = foodLogs.filter((log) => log.meal_id === meal.id);
    const mealFoods: MealFoodItem[] = mealFoodLogs.map((log) => {
      const food = foodsMap.get(log.food_id);
      return {
        food_id: log.food_id,
        name: food?.name || "Unknown",
        serving_size: food?.serving_size || "",
        servings: log.servings,
        calories: (food?.calories || 0) * log.servings,
        protein: (food?.protein || 0) * log.servings,
        fat: (food?.total_fat || 0) * log.servings,
        carbs: (food?.total_carbohydrates || 0) * log.servings,
      };
    });

    const mealTotals = mealFoods.reduce(
      (acc, food) => ({
        calories: acc.calories + food.calories,
        protein: acc.protein + food.protein,
        fat: acc.fat + food.fat,
        carbs: acc.carbs + food.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );

    return {
      meal_id: meal.id,
      name: meal.name,
      time: formatTime(meal.time_hour, meal.time_minute, meal.is_pm),
      time_hour: meal.time_hour,
      time_minute: meal.time_minute,
      is_pm: meal.is_pm,
      foods: mealFoods,
      meal_totals: mealTotals,
    };
  });

  // Calculate daily nutrition totals from all food logs
  const totals: DailySummaryTotals = foodLogs.reduce(
    (acc, log) => {
      const food = foodsMap.get(log.food_id);
      if (!food) return acc;
      const servings = log.servings;
      return {
        calories: acc.calories + (food.calories || 0) * servings,
        protein: acc.protein + (food.protein || 0) * servings,
        fat: acc.fat + (food.total_fat || 0) * servings,
        carbs: acc.carbs + (food.total_carbohydrates || 0) * servings,
        fiber: (acc.fiber || 0) + (food.fiber || 0) * servings,
        sugar: (acc.sugar || 0) + (food.sugar || 0) * servings,
        sodium: (acc.sodium || 0) + (food.sodium || 0) * servings,
        saturated_fat: (acc.saturated_fat || 0) + (food.saturated_fat || 0) * servings,
        vitamin_a: (acc.vitamin_a || 0) + (food.vitamin_a || 0) * servings,
        vitamin_c: (acc.vitamin_c || 0) + (food.vitamin_c || 0) * servings,
        vitamin_d: (acc.vitamin_d || 0) + (food.vitamin_d || 0) * servings,
        calcium: (acc.calcium || 0) + (food.calcium || 0) * servings,
        iron: (acc.iron || 0) + (food.iron || 0) * servings,
      };
    },
    {
      calories: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: null,
      sugar: null,
      sodium: null,
      saturated_fat: null,
      vitamin_a: null,
      vitamin_c: null,
      vitamin_d: null,
      calcium: null,
      iron: null,
    } as DailySummaryTotals
  );

  // Everything taken today, supplements and medications alike.
  type TrackedItemJoin = {
    name: string;
    kind: "supplement" | "medication";
    unit: string;
    doses_per_day: number;
    legacy_key: string | null;
  };

  // PostgREST types a to-one embed as an array; normalize to a single object.
  const trackedRows = (
    (trackedResult.data ?? []) as unknown as Array<{
      amount: number;
      doses_taken: number;
      item: TrackedItemJoin | TrackedItemJoin[] | null;
    }>
  ).map((row) => ({
    amount: row.amount,
    doses_taken: row.doses_taken,
    item: (Array.isArray(row.item) ? row.item[0] ?? null : row.item),
  }));

  const tracked: TrackedItemSummaryEntry[] = trackedRows
    .filter((row) => row.item !== null)
    .map((row) => ({
      name: row.item!.name,
      kind: row.item!.kind,
      unit: row.item!.unit,
      amount: row.amount,
      doses_taken: row.doses_taken,
      doses_per_day: row.item!.doses_per_day,
    }));

  // Legacy fixed-key supplement block, kept populated so the ~380 summaries
  // written before the migration stay comparable with new ones. `tracked`
  // above is the complete picture (custom supplements + medications).
  const amountFor = (legacyKey: string) =>
    trackedRows.find((row) => row.item?.legacy_key === legacyKey)?.amount || 0;

  const supplements: SupplementsSummary = {
    creatine: amountFor("creatine"),
    d3: amountFor("d3"),
    k2: amountFor("k2"),
    vitamin_c: amountFor("vitaminC"),
    zinc: amountFor("zinc"),
    magnesium: amountFor("magnesium"),
    melatonin: amountFor("melatonin"),
    caffeine: amountFor("caffeine"),
  };

  // Build exercise summaries
  const exerciseSummaries: ExerciseSummary[] = exerciseLogs.map((log) => {
    const exercise = exercisesMap.get(log.exercise_id);
    const sets = exerciseSets
      .filter((s) => s.log_id === log.id)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({
        set_number: s.set_number,
        is_warmup: s.is_warmup,
        reps: s.reps,
        weight: s.weight,
        notes: s.notes,
      }));

    const totalReps = sets.reduce((sum, s) => sum + (s.reps || 0), 0);
    const maxWeight = sets.reduce((max, s) => Math.max(max, s.weight || 0), 0);

    return {
      exercise_id: log.exercise_id,
      name: exercise?.name || "Unknown",
      category: exercise?.category || "unknown",
      sets,
      total_sets: sets.length,
      total_reps: totalReps,
      max_weight: maxWeight > 0 ? maxWeight : null,
    };
  });

  // Build treadmill summaries
  const treadmillSummaries: TreadmillSummary[] = treadmillSessions.map((session) => ({
    session_id: session.id,
    duration_minutes: session.duration_minutes,
    incline: session.incline,
    speed: session.speed,
    notes: session.notes,
  }));

  const workout: WorkoutSummary = {
    exercises: exerciseSummaries,
    treadmill: treadmillSummaries,
    total_exercises: exerciseSummaries.length,
    total_sets: exerciseSummaries.reduce((sum, e) => sum + e.total_sets, 0),
    total_cardio_minutes: treadmillSummaries.reduce((sum, t) => sum + t.duration_minutes, 0),
  };

  // Build Whoop summary
  const whoop: WhoopSummary | null = whoopResult.data
    ? {
        recovery_score: whoopResult.data.recovery_score,
        hrv_rmssd: whoopResult.data.hrv_rmssd,
        resting_heart_rate: whoopResult.data.resting_heart_rate,
        spo2_percentage: whoopResult.data.spo2_percentage,
        skin_temp_celsius: whoopResult.data.skin_temp_celsius,
        sleep_score: whoopResult.data.sleep_score,
        sleep_duration_minutes: whoopResult.data.sleep_duration_minutes,
        strain_score: whoopResult.data.strain_score,
        kilojoules: whoopResult.data.kilojoules,
        avg_heart_rate: whoopResult.data.avg_heart_rate,
        max_heart_rate: whoopResult.data.max_heart_rate,
      }
    : null;

  // Habits + day note (habits v2). Sparse truth: every ENABLED habit gets an
  // entry; value stays null when nothing was logged that day. Falls back to
  // the legacy preferences path while add_habits_v2.sql is unapplied, and
  // omits the note (table won't exist yet).
  const [habitLogsResult, userHabitsResult, noteResult] = await Promise.all([
    supabase.from("habit_logs").select("*").eq("date", date).eq("user_id", userId),
    supabase
      .from("user_habits")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("daily_notes")
      .select("note, nutrition_quality")
      .eq("date", date)
      .eq("user_id", userId)
      .single(),
  ]);

  let enabledHabits;
  if (!userHabitsResult.error) {
    enabledHabits = enabledSorted(
      resolveFromV2((userHabitsResult.data as UserHabitRow[]) || [])
    );
  } else if (isMissingSchemaError(userHabitsResult.error)) {
    const { data: prefs } = await supabase
      .from("user_habit_preferences")
      .select("*")
      .eq("user_id", userId);
    enabledHabits = enabledSorted(
      resolveFromLegacy((prefs as HabitPreference[]) || [])
    );
  } else {
    throw userHabitsResult.error;
  }

  const habitLogs = (habitLogsResult.data as HabitLog[]) || [];
  const habits: HabitSummaryEntry[] = enabledHabits.map((habit) => {
    const log = habitLogs.find((l) => l.habit_key === habit.key);
    const interpreted = interpretLog(habit.valueKind, log);
    return {
      habit_key: habit.key,
      name: habit.name,
      kind: habit.valueKind,
      unit: habit.unit,
      goal: habit.goalAmount,
      logged: interpreted.logged,
      value: interpreted.value,
    };
  });

  const day_note: string | null = !noteResult.error
    ? ((noteResult.data?.note as string) || null)
    : null;

  // Nutrition data-quality flag. Stamped into the summary rather than causing
  // the day to be skipped: the aggregate stays complete and honest, and each
  // analysis decides whether to include flagged days. Absent column (migration
  // not yet applied) reads as null, i.e. tracked.
  const nutrition_quality = !noteResult.error
    ? ((noteResult.data as { nutrition_quality?: "incomplete" | "estimated" | null } | null)
        ?.nutrition_quality ?? null)
    : null;

  return {
    date,
    totals,
    meals: mealSummaries,
    supplements,
    tracked,
    workout,
    whoop,
    habits,
    day_note,
    nutrition_quality,
  };
}

// Save aggregated data to daily_summaries table
export async function saveDailySummary(date: string, userId: string, data: DailySummaryData) {
  const supabase = getServerSupabase();
  const { error } = await supabase
    .from("daily_summaries")
    .upsert(
      {
        user_id: userId,
        date,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" }
    );

  if (error) throw error;
}

// Main function: aggregate and save for a specific user
export async function syncDailySummary(date: string, userId: string): Promise<DailySummaryData> {
  const data = await aggregateDailyData(date, userId);
  await saveDailySummary(date, userId, data);
  return data;
}

// Helper to get current user and sync (for use in hooks/components)
export async function syncDailySummaryForCurrentUser(date: string): Promise<DailySummaryData | null> {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return syncDailySummary(date, user.id);
}
