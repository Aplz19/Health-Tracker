import { getServerSupabase } from "@/lib/supabase/server";
import type {
  DailySummaryData,
  DailySummaryTotals,
  MealSummary,
  MealFoodItem,
  SupplementsSummary,
  WorkoutSummary,
  ExerciseSummary,
  TreadmillSummary,
  WhoopSummary,
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

  // Fetch all data in parallel
  const [
    mealsResult,
    foodLogsResult,
    foodsResult,
    creatineResult,
    d3Result,
    k2Result,
    vitaminCResult,
    zincResult,
    magnesiumResult,
    melatoninResult,
    caffeineResult,
    exerciseLogsResult,
    exerciseSetsResult,
    exercisesResult,
    treadmillResult,
    whoopResult,
  ] = await Promise.all([
    supabase.from("meals").select("*").eq("date", date).eq("user_id", userId).order("time_hour").order("time_minute"),
    supabase.from("food_logs").select("*").eq("date", date).eq("user_id", userId),
    supabase.from("foods").select("*"),
    supabase.from("creatine_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("d3_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("k2_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("vitamin_c_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("zinc_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("magnesium_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("melatonin_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("caffeine_logs").select("amount").eq("date", date).eq("user_id", userId).single(),
    supabase.from("exercise_logs").select("*").eq("date", date).eq("user_id", userId),
    supabase.from("exercise_sets").select("*"),
    supabase.from("exercises").select("*"),
    supabase.from("treadmill_sessions").select("*").eq("date", date).eq("user_id", userId),
    supabase.from("whoop_data").select("*").eq("date", date).eq("user_id", userId).single(),
  ]);

  const meals = mealsResult.data || [];
  const foodLogs = foodLogsResult.data || [];
  const foods = foodsResult.data || [];
  const exerciseLogs = exerciseLogsResult.data || [];
  const exerciseSets = exerciseSetsResult.data || [];
  const exercises = exercisesResult.data || [];
  const treadmillSessions = treadmillResult.data || [];

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

  // Build supplements summary
  const supplements: SupplementsSummary = {
    creatine: creatineResult.data?.amount || 0,
    d3: d3Result.data?.amount || 0,
    k2: k2Result.data?.amount || 0,
    vitamin_c: vitaminCResult.data?.amount || 0,
    zinc: zincResult.data?.amount || 0,
    magnesium: magnesiumResult.data?.amount || 0,
    melatonin: melatoninResult.data?.amount || 0,
    caffeine: caffeineResult.data?.amount || 0,
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

  return {
    date,
    totals,
    meals: mealSummaries,
    supplements,
    workout,
    whoop,
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
