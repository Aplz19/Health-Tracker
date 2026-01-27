"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { format, subDays, startOfDay } from "date-fns";

export type TimeRange = "7d" | "30d" | "90d";

/**
 * Time range options for analytics UI
 */
export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

export interface DailyNutrition {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat: number;
  transFat: number;
  polyunsaturatedFat: number;
  monounsaturatedFat: number;
  sodium: number;
  fiber: number;
  sugar: number;
  addedSugar: number;
  vitaminA: number;
  vitaminC: number;
  vitaminD: number;
  calcium: number;
  iron: number;
}

export interface DailyWhoop {
  date: string;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepScore: number | null;
  sleepDuration: number | null;
  strain: number | null;
  spo2: number | null;
  skinTemp: number | null;
  kilojoules: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

export interface DailyCreatine {
  date: string;
  amount: number;
}

export interface DailyExercise {
  date: string;
  workouts: number;
  totalSets: number;
  totalVolume: number;
}

export interface DailyCardio {
  date: string;
  sessions: number;
  totalMinutes: number;
}

export interface AnalyticsData {
  nutrition: DailyNutrition[];
  whoop: DailyWhoop[];
  creatine: DailyCreatine[];
  exercise: DailyExercise[];
  cardio: DailyCardio[];
}

export interface MetricStats {
  current: number;
  average: number;
  min: number;
  max: number;
  trend: number; // percentage change from previous period
}

function getDaysForRange(range: TimeRange): number {
  switch (range) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
  }
}

export function useAnalytics(range: TimeRange = "7d") {
  const [data, setData] = useState<AnalyticsData>({
    nutrition: [],
    whoop: [],
    creatine: [],
    exercise: [],
    cardio: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const days = getDaysForRange(range);
    const startDate = format(subDays(startOfDay(new Date()), days - 1), "yyyy-MM-dd");
    const endDate = format(new Date(), "yyyy-MM-dd");

    try {
      // Fetch nutrition data (food logs aggregated by date)
      const { data: foodLogs } = await supabase
        .from("food_logs")
        .select(`
          date,
          servings,
          food:foods (
            calories,
            protein,
            total_carbohydrates,
            total_fat,
            saturated_fat,
            trans_fat,
            polyunsaturated_fat,
            monounsaturated_fat,
            sodium,
            fiber,
            sugar,
            added_sugar,
            vitamin_a,
            vitamin_c,
            vitamin_d,
            calcium,
            iron
          )
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      // Aggregate nutrition by date
      const nutritionByDate: Record<string, DailyNutrition> = {};
      foodLogs?.forEach((log: any) => {
        const date = log.date;
        if (!nutritionByDate[date]) {
          nutritionByDate[date] = {
            date,
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            saturatedFat: 0,
            transFat: 0,
            polyunsaturatedFat: 0,
            monounsaturatedFat: 0,
            sodium: 0,
            fiber: 0,
            sugar: 0,
            addedSugar: 0,
            vitaminA: 0,
            vitaminC: 0,
            vitaminD: 0,
            calcium: 0,
            iron: 0,
          };
        }
        const multiplier = log.servings;
        const f = log.food;
        nutritionByDate[date].calories += (f.calories || 0) * multiplier;
        nutritionByDate[date].protein += (f.protein || 0) * multiplier;
        nutritionByDate[date].carbs += (f.total_carbohydrates || 0) * multiplier;
        nutritionByDate[date].fat += (f.total_fat || 0) * multiplier;
        nutritionByDate[date].saturatedFat += (f.saturated_fat || 0) * multiplier;
        nutritionByDate[date].transFat += (f.trans_fat || 0) * multiplier;
        nutritionByDate[date].polyunsaturatedFat += (f.polyunsaturated_fat || 0) * multiplier;
        nutritionByDate[date].monounsaturatedFat += (f.monounsaturated_fat || 0) * multiplier;
        nutritionByDate[date].sodium += (f.sodium || 0) * multiplier;
        nutritionByDate[date].fiber += (f.fiber || 0) * multiplier;
        nutritionByDate[date].sugar += (f.sugar || 0) * multiplier;
        nutritionByDate[date].addedSugar += (f.added_sugar || 0) * multiplier;
        nutritionByDate[date].vitaminA += (f.vitamin_a || 0) * multiplier;
        nutritionByDate[date].vitaminC += (f.vitamin_c || 0) * multiplier;
        nutritionByDate[date].vitaminD += (f.vitamin_d || 0) * multiplier;
        nutritionByDate[date].calcium += (f.calcium || 0) * multiplier;
        nutritionByDate[date].iron += (f.iron || 0) * multiplier;
      });

      // Fetch Whoop data
      const { data: whoopData } = await supabase
        .from("whoop_data")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      const whoop: DailyWhoop[] = whoopData?.map((d: any) => ({
        date: d.date,
        recovery: d.recovery_score,
        hrv: d.hrv_rmssd,
        rhr: d.resting_heart_rate,
        sleepScore: d.sleep_score,
        sleepDuration: d.sleep_duration_minutes,
        strain: d.strain_score,
        spo2: d.spo2_percentage,
        skinTemp: d.skin_temp_celsius,
        kilojoules: d.kilojoules,
        avgHeartRate: d.avg_heart_rate,
        maxHeartRate: d.max_heart_rate,
      })) || [];

      // Fetch creatine data
      const { data: creatineData } = await supabase
        .from("creatine_logs")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      const creatine: DailyCreatine[] = creatineData?.map((d: any) => ({
        date: d.date,
        amount: d.amount,
      })) || [];

      // Fetch exercise data
      const { data: exerciseLogs } = await supabase
        .from("exercise_logs")
        .select(`
          id,
          date,
          exercise_sets (
            reps,
            weight,
            is_warmup
          )
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      // Aggregate exercise by date
      const exerciseByDate: Record<string, DailyExercise> = {};
      exerciseLogs?.forEach((log: any) => {
        const date = log.date;
        if (!exerciseByDate[date]) {
          exerciseByDate[date] = { date, workouts: 0, totalSets: 0, totalVolume: 0 };
        }
        exerciseByDate[date].workouts += 1;
        log.exercise_sets?.forEach((set: any) => {
          if (!set.is_warmup) {
            exerciseByDate[date].totalSets += 1;
            exerciseByDate[date].totalVolume += (set.reps || 0) * (set.weight || 0);
          }
        });
      });

      // Fetch cardio data (treadmill sessions)
      const { data: cardioLogs } = await supabase
        .from("treadmill_sessions")
        .select("date, duration_minutes")
        .gte("date", startDate)
        .lte("date", endDate);

      // Aggregate cardio by date
      const cardioByDate: Record<string, DailyCardio> = {};
      cardioLogs?.forEach((log: any) => {
        const date = log.date;
        if (!cardioByDate[date]) {
          cardioByDate[date] = { date, sessions: 0, totalMinutes: 0 };
        }
        cardioByDate[date].sessions += 1;
        cardioByDate[date].totalMinutes += log.duration_minutes || 0;
      });

      // Fill in missing dates with zeros for nutrition
      const allDates: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        allDates.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
      }

      const nutrition = allDates.map(date => nutritionByDate[date] || {
        date,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        saturatedFat: 0,
        transFat: 0,
        polyunsaturatedFat: 0,
        monounsaturatedFat: 0,
        sodium: 0,
        fiber: 0,
        sugar: 0,
        addedSugar: 0,
        vitaminA: 0,
        vitaminC: 0,
        vitaminD: 0,
        calcium: 0,
        iron: 0,
      });

      const exercise = allDates.map(date => exerciseByDate[date] || {
        date,
        workouts: 0,
        totalSets: 0,
        totalVolume: 0,
      });

      const cardio = allDates.map(date => cardioByDate[date] || {
        date,
        sessions: 0,
        totalMinutes: 0,
      });

      setData({ nutrition, whoop, creatine, exercise, cardio });
    } catch (error) {
      console.error("Failed to fetch analytics data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, refetch: fetchData };
}

// Helper to calculate stats for a metric
export function calculateStats(values: number[]): MetricStats {
  const validValues = values.filter(v => v > 0);
  if (validValues.length === 0) {
    return { current: 0, average: 0, min: 0, max: 0, trend: 0 };
  }

  const current = validValues[validValues.length - 1] || 0;
  const average = validValues.reduce((a, b) => a + b, 0) / validValues.length;
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);

  // Calculate trend (compare last half to first half)
  const mid = Math.floor(validValues.length / 2);
  const firstHalf = validValues.slice(0, mid);
  const secondHalf = validValues.slice(mid);

  const firstAvg = firstHalf.length > 0
    ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length
    : 0;
  const secondAvg = secondHalf.length > 0
    ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length
    : 0;

  const trend = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;

  return { current, average, min, max, trend };
}
