"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * Which habits appear in the analytics habit dashboard.
 *
 * Reuses `user_analytics_preferences` with a `habit:` prefix on `metric_key`
 * rather than adding a table -- that table is already a generic per-user
 * key/enabled/sort store, and reusing it means no migration to apply before
 * the feature works.
 *
 * The metric flow keeps its own hook because `toggleMetric` validates keys
 * against METRIC_DEFINITIONS, which habit keys are deliberately not part of.
 *
 * Default is ENABLED: a habit with no stored row shows. So a newly created
 * habit appears without a visit to settings, and only an explicit opt-out is
 * ever written.
 */

const PREFIX = "habit:";

export function useHabitDashboardPreferences() {
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      setUserId(user.id);

      const { data, error } = await supabase
        .from("user_analytics_preferences")
        .select("metric_key, is_enabled")
        .eq("user_id", user.id)
        .like("metric_key", `${PREFIX}%`);

      if (error) throw error;
      setDisabledKeys(
        new Set(
          (data ?? [])
            .filter((row) => row.is_enabled === false)
            .map((row) => (row.metric_key as string).slice(PREFIX.length))
        )
      );
    } catch {
      // Absent preferences are not an error: everything simply shows.
      setDisabledKeys(new Set());
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPreferences();
  }, [fetchPreferences]);

  const isEnabled = useCallback(
    (habitKey: string) => !disabledKeys.has(habitKey),
    [disabledKeys]
  );

  const setHabitEnabled = useCallback(
    async (habitKey: string, enabled: boolean) => {
      if (!userId) return;

      // Optimistic: the grid should respond to the tap immediately.
      setDisabledKeys((prev) => {
        const next = new Set(prev);
        if (enabled) next.delete(habitKey);
        else next.add(habitKey);
        return next;
      });

      const { error } = await supabase.from("user_analytics_preferences").upsert(
        {
          user_id: userId,
          metric_key: `${PREFIX}${habitKey}`,
          is_enabled: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,metric_key" }
      );

      if (error) {
        // Put it back rather than showing a state the database does not hold.
        setDisabledKeys((prev) => {
          const next = new Set(prev);
          if (enabled) next.add(habitKey);
          else next.delete(habitKey);
          return next;
        });
        throw error;
      }
    },
    [userId]
  );

  return { isEnabled, setHabitEnabled, isLoading, refetch: fetchPreferences };
}
