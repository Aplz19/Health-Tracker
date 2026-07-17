"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import { autoCreatesPlaceholder, clampScale } from "@/lib/habits/logic";
import type { HabitLog, HabitValueKind, ResolvedHabit } from "@/types/habits";

// Daily habit LOG hook (v2). Value-kind aware:
//  - checkbox/number habits keep the pre-v2 placeholder behavior (a
//    completed=false row is auto-created when the day is first viewed).
//  - scale/choice habits are SPARSE: no auto-created rows, and clearing a
//    value DELETES the row so an unreported day stays NA (sparse truth).
//  - When the v2 migration is applied (habitsV2 flag), every write snapshots
//    the value_kind it was recorded under; before that, writes use the legacy
//    column set so they succeed against the old schema.

type EnabledHabitShape = Pick<ResolvedHabit, "key" | "valueKind" | "goalAmount">;

export function useHabitLogs(
  date: string,
  enabledHabits: EnabledHabitShape[] = [],
  habitsV2: boolean = false
) {
  const cacheKey = `habit_logs:${date}`;
  const [logs, setLogsState] = useState<HabitLog[]>(
    () => getCached<HabitLog[]>(cacheKey) ?? []
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef<string | null>(null);
  // Stabilize for dependency comparison
  const habitsString = enabledHabits
    .map((h) => `${h.key}:${h.valueKind}`)
    .join(",");

  // Write-through setter keeps the cache in sync with every state change.
  const setLogs = useCallback(
    (updater: React.SetStateAction<HabitLog[]>) => {
      setLogsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCached(cacheKey, next);
        return next;
      });
    },
    [cacheKey]
  );

  const fetchLogs = useCallback(async () => {
    if (!hasCached(cacheKey)) setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("habit_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date);

      if (error) throw error;
      const existingLogs = (data as HabitLog[]) || [];
      setLogs(existingLogs);

      // Auto-create placeholder rows ONLY for checkbox/number habits (legacy
      // behavior). Scale/choice stay sparse - absent means not reported.
      const placeholderHabits = habitsString
        ? habitsString
            .split(",")
            .map((pair) => {
              const [key, valueKind] = pair.split(":");
              return { key, valueKind: valueKind as HabitValueKind };
            })
            .filter((h) => autoCreatesPlaceholder(h.valueKind))
        : [];

      if (placeholderHabits.length > 0 && initializedRef.current !== date) {
        const existingKeys = new Set(existingLogs.map((l) => l.habit_key));
        const missing = placeholderHabits.filter((h) => !existingKeys.has(h.key));

        if (missing.length > 0) {
          const newLogs = missing.map((h) => ({
            user_id: user.id,
            date,
            habit_key: h.key,
            completed: false,
            amount: null,
            ...(habitsV2 ? { value_kind: h.valueKind } : {}),
          }));

          const { data: insertedData, error: insertError } = await supabase
            .from("habit_logs")
            .insert(newLogs)
            .select();

          if (!insertError && insertedData) {
            setLogs((prev) => [...prev, ...(insertedData as HabitLog[])]);
          }
        }
        initializedRef.current = date;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch habit logs");
    } finally {
      setIsLoading(false);
    }
  }, [date, habitsString, habitsV2, cacheKey, setLogs]);

  useEffect(() => {
    // On date change: swap in cached data instantly, then revalidate.
    const cached = getCached<HabitLog[]>(cacheKey);
    setLogsState(cached ?? []);
    setIsLoading(cached === undefined);
    fetchLogs();
  }, [cacheKey, fetchLogs]);

  const getLogForHabit = useCallback(
    (habitKey: string): HabitLog | undefined =>
      logs.find((log) => log.habit_key === habitKey),
    [logs]
  );

  // Core writer: upsert one log row with optimistic local state.
  const writeLog = useCallback(
    async (
      habitKey: string,
      valueKind: HabitValueKind,
      fields: { completed: boolean; amount: number | null; value_text: string | null }
    ): Promise<void> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error("Not authenticated");

        const optimistic: HabitLog = {
          id:
            logs.find((l) => l.habit_key === habitKey)?.id ??
            `temp-${Date.now()}`,
          user_id: user.id,
          date,
          habit_key: habitKey,
          completed: fields.completed,
          amount: fields.amount,
          value_kind: habitsV2 ? valueKind : null,
          value_text: fields.value_text,
          created_at: new Date().toISOString(),
        };
        setLogs((prev) => {
          const exists = prev.some((l) => l.habit_key === habitKey);
          return exists
            ? prev.map((l) => (l.habit_key === habitKey ? { ...l, ...optimistic, id: l.id } : l))
            : [...prev, optimistic];
        });

        const row: Record<string, unknown> = {
          user_id: user.id,
          date,
          habit_key: habitKey,
          completed: fields.completed,
          amount: fields.amount,
        };
        if (habitsV2) {
          row.value_kind = valueKind;
          row.value_text = fields.value_text;
        }

        const { data, error } = await supabase
          .from("habit_logs")
          .upsert(row, { onConflict: "user_id,date,habit_key" })
          .select()
          .single();

        if (error) throw error;
        if (data) {
          setLogs((prev) =>
            prev.map((l) => (l.habit_key === habitKey ? (data as HabitLog) : l))
          );
        }
      } catch (err) {
        await fetchLogs();
        throw err;
      }
    },
    [date, logs, habitsV2, setLogs, fetchLogs]
  );

  // Delete a log row entirely - restores NA for scale/choice habits.
  const clearLog = useCallback(
    async (habitKey: string): Promise<void> => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error("Not authenticated");

        setLogs((prev) => prev.filter((l) => l.habit_key !== habitKey));
        const { error } = await supabase
          .from("habit_logs")
          .delete()
          .eq("user_id", user.id)
          .eq("date", date)
          .eq("habit_key", habitKey);
        if (error) throw error;
      } catch (err) {
        await fetchLogs();
        throw err;
      }
    },
    [date, setLogs, fetchLogs]
  );

  // ---- kind-specific helpers used by the tab ----

  // checkbox: flip yes/no (row persists either way - an explicit no)
  const toggleCheckbox = (habitKey: string) => {
    const current = getLogForHabit(habitKey);
    return writeLog(habitKey, "checkbox", {
      completed: !current?.completed,
      amount: null,
      value_text: null,
    });
  };

  // number + goal: one-tap complete at the goal amount / un-complete
  const quickCompleteNumber = (habitKey: string, goalAmount: number) => {
    const current = getLogForHabit(habitKey);
    const isComplete = (current?.amount ?? 0) >= goalAmount && goalAmount > 0;
    return writeLog(habitKey, "number", {
      completed: !isComplete,
      amount: isComplete ? null : goalAmount,
      value_text: null,
    });
  };

  // number: exact amount entry
  const setNumberAmount = (habitKey: string, amount: number) =>
    writeLog(habitKey, "number", {
      completed: amount > 0,
      amount: amount > 0 ? amount : null,
      value_text: null,
    });

  // scale: tap a 1-5 value; tapping the selected value again clears to NA
  const setScaleValue = (habitKey: string, value: number | null) => {
    if (value === null) return clearLog(habitKey);
    return writeLog(habitKey, "scale", {
      completed: true,
      amount: clampScale(value),
      value_text: null,
    });
  };

  // choice: tap an option; tapping the selected option again clears to NA
  const setChoiceValue = (habitKey: string, option: string | null) => {
    if (option === null) return clearLog(habitKey);
    return writeLog(habitKey, "choice", {
      completed: true,
      amount: null,
      value_text: option,
    });
  };

  return {
    logs,
    isLoading,
    error,
    getLogForHabit,
    toggleCheckbox,
    quickCompleteNumber,
    setNumberAmount,
    setScaleValue,
    setChoiceValue,
    clearLog,
    refetch: fetchLogs,
  };
}
