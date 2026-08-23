"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import { getAnalyticsWindow, type TimeRange } from "@/hooks/use-analytics";
import { interpretLog } from "@/lib/habits/logic";
import type { HabitLog, ResolvedHabit } from "@/types/habits";

/**
 * Counts of each tracked habit over the selected analytics window.
 *
 * Deliberately numbers only -- no series, no charts. "How many days did I eat
 * out in the last 90?" is the question this answers, and a count plus the
 * denominator answers it more honestly than a sparkline would.
 *
 * Uses the same window as every other analytics view (see getAnalyticsWindow),
 * so it never disagrees with the charts and never counts the partial current
 * day.
 */

export interface HabitDashboardEntry {
  key: string;
  name: string;
  emoji: string | null;
  builtinKey: string | null;
  unit: string;
  /**
   * Days that "count": for a checkbox, days answered yes; for every other kind,
   * days with any value recorded. Never inferred from absence -- an unlogged
   * day is not a zero (sparse truth, as in habits v2).
   */
  count: number;
  /** Days the habit was logged at all, whatever the value. */
  loggedDays: number;
  /** Complete days in the window -- the denominator for the percentage. */
  totalDays: number;
}

export function useHabitDashboard(range: TimeRange, habits: ResolvedHabit[]) {
  const { startDate, endDate, days } = useMemo(() => getAnalyticsWindow(range), [range]);
  const cacheKey = `habit-dashboard:${range}`;

  const [logs, setLogs] = useState<HabitLog[]>(() => getCached<HabitLog[]>(cacheKey) ?? []);
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    if (!hasCached(cacheKey)) setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error: queryError } = await supabase
        .from("habit_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate);

      if (queryError) throw queryError;
      const rows = (data ?? []) as HabitLog[];
      setCached(cacheKey, rows);
      setLogs(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load habit counts");
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, startDate, endDate]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const entries = useMemo<HabitDashboardEntry[]>(() => {
    const byHabit = new Map<string, HabitLog[]>();
    for (const log of logs) {
      const list = byHabit.get(log.habit_key);
      if (list) list.push(log);
      else byHabit.set(log.habit_key, [log]);
    }

    return habits.map((habit) => {
      const habitLogs = byHabit.get(habit.key) ?? [];
      let count = 0;
      let loggedDays = 0;

      for (const log of habitLogs) {
        const { logged, value } = interpretLog(habit.valueKind, log);
        if (!logged) continue;
        loggedDays += 1;
        // A checkbox only counts when the answer was yes; other kinds count as
        // soon as anything was recorded.
        if (habit.valueKind === "checkbox") {
          if (value === true) count += 1;
        } else {
          count += 1;
        }
      }

      return {
        key: habit.key,
        name: habit.name,
        emoji: habit.emoji,
        builtinKey: habit.builtinKey,
        unit: habit.unit,
        count,
        loggedDays,
        totalDays: days,
      };
    });
  }, [logs, habits, days]);

  return { entries, isLoading, error, refetch: fetchLogs, startDate, endDate, totalDays: days };
}
