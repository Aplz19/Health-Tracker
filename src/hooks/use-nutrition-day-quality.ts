"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, setCached } from "@/lib/client-cache";
import { isMissingSchemaError } from "@/lib/habits/logic";

// Per-day nutrition data-quality flag (daily_notes.nutrition_quality).
//
// NULL means the day was tracked normally; "incomplete" means the user marked
// it untrustworthy (travelling, no scale, an un-loggable meal out). Analyses
// exclude flagged days by default — see useAnalytics and the daily summary.
//
// Degrades gracefully like useDailyNote: if add_nutrition_day_quality.sql
// hasn't been applied, `available` stays false and the UI hides the control
// rather than offering a toggle whose writes can't persist.

export type NutritionQuality = "incomplete" | "estimated" | null;

export function useNutritionDayQuality(date: string) {
  const cacheKey = `nutrition_quality:${date}`;
  const [quality, setQualityState] = useState<NutritionQuality>(
    () => getCached<NutritionQuality>(cacheKey) ?? null
  );
  const [available, setAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const cached = getCached<NutritionQuality>(cacheKey);
    setQualityState(cached ?? null);
    setIsLoading(cached === undefined);

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from("daily_notes")
          .select("nutrition_quality")
          .eq("user_id", user.id)
          .eq("date", date)
          .single();

        if (cancelled) return;

        if (!error) {
          setAvailable(true);
          const value = (data?.nutrition_quality as NutritionQuality) ?? null;
          setQualityState(value);
          setCached(cacheKey, value);
        } else if (error.code === "PGRST116") {
          // Table/column exist, no row for this day yet — that means tracked.
          setAvailable(true);
          setQualityState(null);
          setCached(cacheKey, null);
        } else if (isMissingSchemaError(error)) {
          setAvailable(false);
        }
      } catch {
        // Network/auth failure — keep the control hidden.
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [date, cacheKey]);

  const setQuality = useCallback(
    async (value: NutritionQuality) => {
      if (!available) return;

      const previous = quality;
      // Optimistic: the checkbox should feel instant.
      setQualityState(value);
      setCached(cacheKey, value);
      setIsSaving(true);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error("Not authenticated");

        // Only these columns are written, so the habits-tab note on the same
        // row is left untouched (and vice versa).
        const { error } = await supabase.from("daily_notes").upsert(
          {
            user_id: user.id,
            date,
            nutrition_quality: value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );
        if (error) throw error;

        // Re-stamp the stored daily summary for this date so downstream
        // analysis sees the flag immediately. The nightly cron would
        // eventually do this, but the flag is usually set for a past day whose
        // summary already exists.
        void fetch("/api/daily-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        }).catch(() => {
          // Best effort: the summary is rebuilt nightly regardless.
        });
      } catch (err) {
        // Roll the optimistic update back so the checkbox can't lie.
        setQualityState(previous);
        setCached(cacheKey, previous);
        console.error("Failed to save nutrition day quality:", err);
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [available, date, cacheKey, quality]
  );

  return {
    quality,
    isIncomplete: quality !== null,
    setQuality,
    available,
    isLoading,
    isSaving,
  };
}
