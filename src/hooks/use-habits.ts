"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  enabledSorted,
  generateHabitKey,
  isMissingSchemaError,
  resolveFromLegacy,
  resolveFromV2,
} from "@/lib/habits/logic";
import { getBuiltinMeta } from "@/lib/habits/meta";
import type {
  HabitPatch,
  HabitPreference,
  NewHabitInput,
  ResolvedHabit,
  UserHabitRow,
} from "@/types/habits";

// Habit DEFINITIONS hook (v2). Source of truth is the user_habits table; when
// the add_habits_v2.sql migration is not applied yet, it falls back to the
// legacy hardcoded-definitions + user_habit_preferences path (v2Available =
// false) with a reduced feature set: no custom habits, no scale/choice kinds,
// no emoji/name/unit edits. Same graceful-degradation pattern as
// use-nutrition-goals.ts.

function parseRow(row: UserHabitRow & { choice_options: unknown }): UserHabitRow {
  return {
    ...row,
    choice_options: Array.isArray(row.choice_options)
      ? (row.choice_options as string[])
      : null,
  };
}

export function useHabits() {
  const [rows, setRows] = useState<UserHabitRow[]>([]);
  const [legacyPrefs, setLegacyPrefs] = useState<HabitPreference[]>([]);
  // null = still probing; true/false once known.
  const [v2Available, setV2Available] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");
      setUserId(user.id);

      const { data, error: v2Error } = await supabase
        .from("user_habits")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });

      if (!v2Error) {
        setV2Available(true);
        setRows(((data as UserHabitRow[]) || []).map(parseRow));
        return;
      }

      if (!isMissingSchemaError(v2Error)) throw v2Error;

      // Migration not applied: legacy fallback.
      setV2Available(false);
      const { data: prefs, error: prefsError } = await supabase
        .from("user_habit_preferences")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true });
      if (prefsError) throw prefsError;
      setLegacyPrefs((prefs as HabitPreference[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch habits");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const allHabits = useMemo<ResolvedHabit[]>(
    () => (v2Available ? resolveFromV2(rows) : resolveFromLegacy(legacyPrefs)),
    [v2Available, rows, legacyPrefs]
  );

  const getAllHabits = useCallback(() => allHabits, [allHabits]);
  const getEnabledHabits = useCallback(
    () => enabledSorted(allHabits),
    [allHabits]
  );

  // ------------------------------------------------------------------
  // v2 writes (optimistic local state + background sync, repo style)
  // ------------------------------------------------------------------

  const syncError = (label: string) => ({ error }: { error: unknown }) => {
    if (error) console.error(`Failed to sync ${label}:`, error);
  };

  const addHabit = async (input: NewHabitInput): Promise<string | null> => {
    if (!userId || !v2Available) return null;
    const habit_key = generateHabitKey(input.name);
    const maxOrder = Math.max(0, ...rows.map((r) => r.sort_order));
    const newRow: UserHabitRow = {
      id: `temp-${Date.now()}`,
      user_id: userId,
      habit_key,
      name: input.name,
      emoji: input.emoji,
      unit: input.unit,
      value_kind: input.valueKind,
      goal_amount: input.valueKind === "number" ? input.goalAmount : null,
      step: input.step,
      choice_options: input.valueKind === "choice" ? input.choiceOptions : null,
      is_enabled: true,
      sort_order: maxOrder + 1,
      archived_at: null,
    };
    setRows((prev) => [...prev, newRow]);

    const { data, error } = await supabase
      .from("user_habits")
      .insert({
        user_id: newRow.user_id,
        habit_key: newRow.habit_key,
        name: newRow.name,
        emoji: newRow.emoji,
        unit: newRow.unit,
        value_kind: newRow.value_kind,
        goal_amount: newRow.goal_amount,
        step: newRow.step,
        choice_options: newRow.choice_options,
        is_enabled: true,
        sort_order: newRow.sort_order,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to add habit:", error);
      setRows((prev) => prev.filter((r) => r.habit_key !== habit_key));
      return null;
    }
    setRows((prev) =>
      prev.map((r) => (r.habit_key === habit_key ? parseRow(data as UserHabitRow) : r))
    );
    return habit_key;
  };

  const updateHabit = async (key: string, patch: HabitPatch): Promise<void> => {
    if (!userId) return;

    if (v2Available) {
      // Optimistic
      setRows((prev) =>
        prev.map((r) =>
          r.habit_key === key
            ? {
                ...r,
                name: patch.name ?? r.name,
                emoji: patch.emoji !== undefined ? patch.emoji : r.emoji,
                unit: patch.unit ?? r.unit,
                value_kind: patch.valueKind ?? r.value_kind,
                goal_amount:
                  patch.goalAmount !== undefined ? patch.goalAmount : r.goal_amount,
                step: patch.step !== undefined ? patch.step : r.step,
                choice_options:
                  patch.choiceOptions !== undefined
                    ? patch.choiceOptions
                    : r.choice_options,
                is_enabled: patch.isEnabled ?? r.is_enabled,
              }
            : r
        )
      );

      const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.emoji !== undefined) dbPatch.emoji = patch.emoji;
      if (patch.unit !== undefined) dbPatch.unit = patch.unit;
      if (patch.valueKind !== undefined) dbPatch.value_kind = patch.valueKind;
      if (patch.goalAmount !== undefined) dbPatch.goal_amount = patch.goalAmount;
      if (patch.step !== undefined) dbPatch.step = patch.step;
      if (patch.choiceOptions !== undefined) dbPatch.choice_options = patch.choiceOptions;
      if (patch.isEnabled !== undefined) dbPatch.is_enabled = patch.isEnabled;
      // Kind changes: options must match the target kind's shape.
      if (patch.valueKind !== undefined && patch.valueKind !== "choice") {
        dbPatch.choice_options = null;
      }

      supabase
        .from("user_habits")
        .update(dbPatch)
        .eq("user_id", userId)
        .eq("habit_key", key)
        .then(syncError("habit update"));
      return;
    }

    // Legacy fallback: only mode/goal/enabled are expressible. valueKind maps
    // checkbox->checkbox, number->goal (keeps quick-complete).
    setLegacyPrefs((prev) => {
      const existing = prev.find((p) => p.habit_key === key);
      const meta = getBuiltinMeta(key);
      const base: HabitPreference = existing ?? {
        user_id: userId,
        habit_key: key,
        is_enabled: false,
        tracking_mode: "checkbox",
        goal_amount: meta?.defaultGoal ?? null,
        sort_order: 999,
      };
      const next: HabitPreference = {
        ...base,
        is_enabled: patch.isEnabled ?? base.is_enabled,
        tracking_mode:
          patch.valueKind === undefined
            ? base.tracking_mode
            : patch.valueKind === "checkbox"
              ? "checkbox"
              : "goal",
        goal_amount:
          patch.goalAmount !== undefined ? patch.goalAmount : base.goal_amount,
      };
      const rest = prev.filter((p) => p.habit_key !== key);
      // Background sync with the FULL row so an upsert never clobbers fields
      // back to defaults (the pre-v2 toggle bug).
      supabase
        .from("user_habit_preferences")
        .upsert(
          {
            user_id: next.user_id,
            habit_key: next.habit_key,
            is_enabled: next.is_enabled,
            tracking_mode: next.tracking_mode,
            goal_amount: next.goal_amount,
            sort_order: next.sort_order,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,habit_key" }
        )
        .then(syncError("habit preference"));
      return [...rest, next];
    });
  };

  const toggleHabit = async (key: string, enabled: boolean): Promise<void> => {
    if (!userId) return;
    if (v2Available) {
      const maxOrder = Math.max(0, ...rows.map((r) => r.sort_order));
      const sort_order = enabled ? maxOrder + 1 : 999;
      setRows((prev) =>
        prev.map((r) =>
          r.habit_key === key ? { ...r, is_enabled: enabled, sort_order } : r
        )
      );
      supabase
        .from("user_habits")
        .update({ is_enabled: enabled, sort_order, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("habit_key", key)
        .then(syncError("habit toggle"));
      return;
    }
    // Legacy: preserve mode/goal (fixes the clobber bug) by routing through
    // updateHabit's full-row upsert.
    const maxOrder = Math.max(0, ...legacyPrefs.map((p) => p.sort_order));
    setLegacyPrefs((prev) =>
      prev.map((p) =>
        p.habit_key === key ? { ...p, sort_order: enabled ? maxOrder + 1 : 999 } : p
      )
    );
    await updateHabit(key, { isEnabled: enabled });
  };

  const archiveHabit = async (key: string): Promise<void> => {
    if (!userId || !v2Available) return;
    setRows((prev) =>
      prev.map((r) =>
        r.habit_key === key
          ? { ...r, archived_at: new Date().toISOString(), is_enabled: false }
          : r
      )
    );
    supabase
      .from("user_habits")
      .update({
        archived_at: new Date().toISOString(),
        is_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("habit_key", key)
      .then(syncError("habit archive"));
  };

  const reorderHabits = async (orderedKeys: string[]): Promise<void> => {
    if (!userId) return;
    if (v2Available) {
      setRows((prev) =>
        prev.map((r) => {
          const index = orderedKeys.indexOf(r.habit_key);
          return index >= 0 ? { ...r, sort_order: index } : r;
        })
      );
      const updates = orderedKeys.map((key, index) =>
        supabase
          .from("user_habits")
          .update({ sort_order: index, updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("habit_key", key)
      );
      Promise.all(updates).then((results) => {
        const errors = results.filter((r) => r.error);
        if (errors.length > 0) console.error("Failed to sync reorder:", errors);
      });
      return;
    }
    setLegacyPrefs((prev) =>
      prev.map((p) => {
        const index = orderedKeys.indexOf(p.habit_key);
        return index >= 0 ? { ...p, sort_order: index } : p;
      })
    );
    const updates = orderedKeys.map((key, index) =>
      supabase
        .from("user_habit_preferences")
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("habit_key", key)
    );
    Promise.all(updates).then((results) => {
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) console.error("Failed to sync reorder:", errors);
    });
  };

  return {
    isLoading,
    error,
    // false while probing: features unlock, never flash-then-vanish
    v2Available: v2Available === true,
    getAllHabits,
    getEnabledHabits,
    addHabit,
    updateHabit,
    toggleHabit,
    archiveHabit,
    reorderHabits,
    refetch: fetchAll,
  };
}
