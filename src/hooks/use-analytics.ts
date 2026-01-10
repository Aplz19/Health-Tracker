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
}

export interface DailyWhoop {
  date: string;
  recovery: number | null;
  hrv: number | null;
  rhr: number | null;
  sleepScore: number | null;
  sleepDuration: number | null;
  strain: number | null;
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

export interface AnalyticsData {
  nutrition: DailyNutrition[];
  whoop: DailyWhoop[];
  creatine: DailyCreatine[];
  exercise: DailyExercise[];
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
            total_fat
          )
        `)
        .gte("date", startDate)
        .lte("date", endDate);

      // Aggregate nutrition by date
      const nutritionByDate: Record<string, DailyNutrition> = {};
      foodLogs?.forEach((log: any) => {
        const date = log.date;
        if (!nutritionByDate[date]) {
          nutritionByDate[date] = { date, calories: 0, protein: 0, carbs: 0, fat: 0 };
        }
        const multiplier = log.servings;
        nutritionByDate[date].calories += log.food.calories * multiplier;
        nutritionByDate[date].protein += log.food.protein * multiplier;
        nutritionByDate[date].carbs += log.food.total_carbohydrates * multiplier;
        nutritionByDate[date].fat += log.food.total_fat * multiplier;
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
      });

      const exercise = allDates.map(date => exerciseByDate[date] || {
        date,
        workouts: 0,
        totalSets: 0,
        totalVolume: 0,
      });

      setData({ nutrition, whoop, creatine, exercise });
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
