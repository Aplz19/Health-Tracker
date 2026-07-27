"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";

// What you did the last time you trained an exercise, so the logger can show
// it as ghost text behind the inputs: you can see last week's numbers while
// deciding today's, and fill them in with a double-tap when nothing changed.

export interface LastSetPerformance {
  reps: number | null;
  weight: number | null;
}

/** exercise_id -> that session's working sets, in order. */
export type LastPerformanceMap = Record<string, LastSetPerformance[]>;

interface LastPerfRow {
  exercise_id: string;
  date: string;
  exercise_sets:
    | Array<{ set_number: number; reps: number | null; weight: number | null; is_warmup: boolean }>
    | null;
}

export function useLastExercisePerformance(exerciseIds: string[], beforeDate: string) {
  // Stable key: order of the ids shouldn't cause refetches.
  const idKey = [...exerciseIds].sort().join(",");
  const cacheKey = `last_exercise_perf:${beforeDate}:${idKey}`;

  const [lastPerformance, setLastPerformance] = useState<LastPerformanceMap>(
    () => getCached<LastPerformanceMap>(cacheKey) ?? {}
  );

  const fetchLastPerformance = useCallback(async () => {
    if (exerciseIds.length === 0) {
      setLastPerformance({});
      return;
    }

    try {
      // One query for every exercise in the session. Postgrest can't do
      // DISTINCT ON, so pull recent logs newest-first and keep the first
      // occurrence per exercise client-side.
      const { data, error } = await supabase
        .from("exercise_logs")
        .select(
          `exercise_id, date, exercise_sets ( set_number, reps, weight, is_warmup )`
        )
        .in("exercise_id", exerciseIds)
        .lt("date", beforeDate)
        .order("date", { ascending: false })
        .limit(200);

      if (error) throw error;

      const map: LastPerformanceMap = {};
      (data as LastPerfRow[] | null)?.forEach((log) => {
        // Newest-first, so the first row seen for an exercise is its last session.
        if (map[log.exercise_id]) return;

        const workingSets = (log.exercise_sets ?? [])
          .filter((s) => !s.is_warmup)
          .filter((s) => s.reps !== null || s.weight !== null)
          .sort((a, b) => a.set_number - b.set_number)
          .map((s) => ({ reps: s.reps, weight: s.weight }));

        // A session where nothing was actually filled in tells us nothing —
        // skip it so we keep looking further back.
        if (workingSets.length > 0) {
          map[log.exercise_id] = workingSets;
        }
      });

      setLastPerformance(map);
      setCached(cacheKey, map);
    } catch {
      // Non-critical: the logger just won't show ghost values.
    }
  }, [exerciseIds, beforeDate, cacheKey]);

  useEffect(() => {
    const cached = getCached<LastPerformanceMap>(cacheKey);
    setLastPerformance(cached ?? {});
    if (!hasCached(cacheKey)) {
      fetchLastPerformance();
    }
    // idKey (not the array) drives this, so a caller passing a fresh array
    // literal each render doesn't loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { lastPerformance, refetch: fetchLastPerformance };
}

/**
 * The reference set for a given position: last session's set at the same
 * index, falling back to its final set so later sets still show something.
 */
export function getReferenceSet(
  sets: LastSetPerformance[] | undefined,
  index: number
): LastSetPerformance | null {
  if (!sets || sets.length === 0) return null;
  return sets[index] ?? sets[sets.length - 1];
}
