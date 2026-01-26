"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { METRIC_DEFINITIONS, DEFAULT_ENABLED_METRICS } from "@/lib/analytics/config";
import type { MetricPreference, UserMetric } from "@/types/analytics";

export function useAnalyticsPreferences() {
  const [preferences, setPreferences] = useState<MetricPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    const fetchPreferences = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        setUserId(user.id);

        const { data, error } = await supabase
          .from("user_analytics_preferences")
          .select("*")
          .eq("user_id", user.id)
          .order("sort_order", { ascending: true });

        if (error) throw error;
        setPreferences((data as MetricPreference[]) || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch preferences");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPreferences();
  }, []);

  // Get all metrics with their preferences (for settings)
  const getAllMetrics = useCallback((): UserMetric[] => {
    return METRIC_DEFINITIONS.map((definition, index) => {
      const pref = preferences.find((p) => p.metric_key === definition.key);
      // If no preference exists, use defaults
      const isEnabled = pref?.is_enabled ?? DEFAULT_ENABLED_METRICS.includes(definition.key);
      return {
        definition,
        preference: pref || null,
        isEnabled,
        sortOrder: pref?.sort_order ?? index,
      };
    });
  }, [preferences]);

  // Get only enabled metrics sorted by order (for analytics tab)
  const getEnabledMetrics = useCallback((): UserMetric[] => {
    return getAllMetrics()
      .filter((m) => m.isEnabled)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [getAllMetrics]);

  // Toggle metric enabled/disabled - OPTIMISTIC UPDATE
  const toggleMetric = async (key: string, enabled: boolean): Promise<void> => {
    if (!userId) return;

    const definition = METRIC_DEFINITIONS.find((m) => m.key === key);
    if (!definition) throw new Error("Unknown metric");

    // Get current max sort order for new enabled metrics
    const maxOrder = Math.max(0, ...preferences.map((p) => p.sort_order));
    const newSortOrder = enabled ? maxOrder + 1 : 999;

    // Optimistic update
    setPreferences((prev) => {
      const existing = prev.find((p) => p.metric_key === key);
      if (existing) {
        return prev.map((p) =>
          p.metric_key === key
            ? { ...p, is_enabled: enabled, sort_order: newSortOrder }
            : p
        );
      } else {
        return [
          ...prev,
          {
            user_id: userId,
            metric_key: key,
            is_enabled: enabled,
            sort_order: newSortOrder,
          },
        ];
      }
    });

    // Sync to database in background
    supabase
      .from("user_analytics_preferences")
      .upsert(
        {
          user_id: userId,
          metric_key: key,
          is_enabled: enabled,
          sort_order: newSortOrder,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,metric_key" }
      )
      .then(({ error }) => {
        if (error) console.error("Failed to sync toggle:", error);
      });
  };

  // Reorder metrics - OPTIMISTIC UPDATE
  const reorderMetrics = async (orderedKeys: string[]): Promise<void> => {
    if (!userId) return;

    // Optimistic update
    setPreferences((prev) =>
      prev.map((p) => {
        const newIndex = orderedKeys.indexOf(p.metric_key);
        return newIndex >= 0 ? { ...p, sort_order: newIndex } : p;
      })
    );

    // Sync to database in background
    const updates = orderedKeys.map((key, index) =>
      supabase
        .from("user_analytics_preferences")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("metric_key", key)
    );

    Promise.all(updates).then((results) => {
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) console.error("Failed to sync reorder:", errors);
    });
  };

  // Manual refetch if needed
  const refetch = async () => {
    if (!userId) return;

    const { data, error } = await supabase
      .from("user_analytics_preferences")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });

    if (!error && data) {
      setPreferences(data as MetricPreference[]);
    }
  };

  return {
    preferences,
    isLoading,
    error,
    getAllMetrics,
    getEnabledMetrics,
    toggleMetric,
    reorderMetrics,
    refetch,
  };
}
