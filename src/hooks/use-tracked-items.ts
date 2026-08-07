"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached, deleteCached } from "@/lib/client-cache";
import { isMissingSchemaError } from "@/lib/habits/logic";

// Supplements and medications, one row per user-created item plus one generic
// log table — the shape habits v2 proved. Replaces 15 hardcoded definitions
// with a table each (creatine_logs, d3_logs, ...) and the ~15 useSupplement
// hook calls the dietary tab used to make.
//
// THE INVARIANT: a log row stores the amount actually taken on that date.
// Nothing here may ever recompute a historical amount from the item's current
// settings — that is what makes the logs themselves the dose history (raising
// a D3 goal from 5000 to 10000 must not rewrite the days logged at 5000).

export type TrackedItemKind = "supplement" | "medication";
export type TrackingMode = "manual" | "goal";

export interface TrackedItem {
  id: string;
  kind: TrackedItemKind;
  name: string;
  unit: string;
  /** Amount per dose. For medications, the strength of one tablet. */
  dose_amount: number | null;
  /** Doses per day; the UI renders this many checkboxes. 0 = as needed. */
  doses_per_day: number;
  /** "Currently taking". Disabling hides an item but never deletes history. */
  is_enabled: boolean;
  tracking_mode: TrackingMode;
  goal_amount: number | null;
  sort_order: number;
  legacy_key: string | null;
}

export interface TrackedItemDayLog {
  item_id: string;
  amount: number;
  doses_taken: number;
}

export type TrackedItemInput = Omit<TrackedItem, "id" | "legacy_key">;

const ITEMS_CACHE_KEY = "tracked_items";

export function useTrackedItems(date: string) {
  const logsCacheKey = `tracked_item_logs:${date}`;

  const [items, setItemsState] = useState<TrackedItem[]>(
    () => getCached<TrackedItem[]>(ITEMS_CACHE_KEY) ?? []
  );
  const [logs, setLogsState] = useState<Record<string, TrackedItemDayLog>>(
    () => getCached<Record<string, TrackedItemDayLog>>(logsCacheKey) ?? {}
  );
  // False until we've confirmed the tables exist, so the UI can hide itself
  // rather than offering controls whose writes can't persist.
  const [available, setAvailable] = useState(() => hasCached(ITEMS_CACHE_KEY));
  const [isLoading, setIsLoading] = useState(() => !hasCached(ITEMS_CACHE_KEY));

  const setItems = useCallback((updater: React.SetStateAction<TrackedItem[]>) => {
    setItemsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      setCached(ITEMS_CACHE_KEY, next);
      return next;
    });
  }, []);

  const setLogs = useCallback(
    (updater: React.SetStateAction<Record<string, TrackedItemDayLog>>) => {
      setLogsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        setCached(logsCacheKey, next);
        return next;
      });
    },
    [logsCacheKey]
  );

  const fetchItems = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("user_tracked_items")
        .select(
          "id, kind, name, unit, dose_amount, doses_per_day, is_enabled, tracking_mode, goal_amount, sort_order, legacy_key"
        )
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        if (isMissingSchemaError(error)) setAvailable(false);
        return;
      }
      setAvailable(true);
      setItems((data as TrackedItem[]) ?? []);
    } catch {
      // Network failure — keep whatever is cached.
    } finally {
      setIsLoading(false);
    }
  }, [setItems]);

  const fetchLogs = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("tracked_item_logs")
        .select("item_id, amount, doses_taken")
        .eq("date", date);

      if (error) return;

      const map: Record<string, TrackedItemDayLog> = {};
      (data as TrackedItemDayLog[] | null)?.forEach((row) => {
        map[row.item_id] = row;
      });
      setLogs(map);
    } catch {
      // Keep cached logs.
    }
  }, [date, setLogs]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const cached = getCached<Record<string, TrackedItemDayLog>>(logsCacheKey);
    setLogsState(cached ?? {});
    fetchLogs();
  }, [logsCacheKey, fetchLogs]);

  /**
   * Record what was taken today. `amount` is written verbatim and becomes
   * permanent history for this date.
   */
  const setDayLog = useCallback(
    async (itemId: string, amount: number, dosesTaken: number) => {
      const previous = logs[itemId];
      setLogs((prev) => ({
        ...prev,
        [itemId]: { item_id: itemId, amount, doses_taken: dosesTaken },
      }));

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error("Not authenticated");

        const { error } = await supabase.from("tracked_item_logs").upsert(
          {
            user_id: user.id,
            item_id: itemId,
            date,
            amount,
            doses_taken: dosesTaken,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "item_id,date" }
        );
        if (error) throw error;
      } catch (err) {
        // Roll back so the checkbox can't claim something that didn't save.
        setLogs((prev) => {
          const next = { ...prev };
          if (previous) next[itemId] = previous;
          else delete next[itemId];
          return next;
        });
        console.error("Failed to save tracked item log:", err);
        throw err;
      }
    },
    [date, logs, setLogs]
  );

  /** Toggle/step the doses taken today; amount is derived from the item. */
  const setDosesTaken = useCallback(
    async (item: TrackedItem, dosesTaken: number) => {
      const perDose = item.dose_amount ?? item.goal_amount ?? 0;
      await setDayLog(item.id, perDose * dosesTaken, dosesTaken);
    },
    [setDayLog]
  );

  /**
   * Copy another day's amounts onto this date for the given items ("fill from
   * yesterday"). Copies the amount that was actually logged then — it does not
   * recompute from current settings.
   */
  const fillFromDate = useCallback(
    async (sourceDate: string, targetItems: TrackedItem[]) => {
      if (targetItems.length === 0) return;

      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const ids = targetItems.map((i) => i.id);
      const { data, error } = await supabase
        .from("tracked_item_logs")
        .select("item_id, amount, doses_taken")
        .eq("date", sourceDate)
        .in("item_id", ids);
      if (error) throw error;

      const source = (data as TrackedItemDayLog[] | null) ?? [];
      if (source.length === 0) return;

      const rows = source.map((row) => ({
        user_id: user.id,
        item_id: row.item_id,
        date,
        amount: row.amount,
        doses_taken: row.doses_taken,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("tracked_item_logs")
        .upsert(rows, { onConflict: "item_id,date" });
      if (upsertError) throw upsertError;

      setLogs((prev) => {
        const next = { ...prev };
        source.forEach((row) => {
          next[row.item_id] = { ...row };
        });
        return next;
      });
    },
    [date, setLogs]
  );

  const createItem = useCallback(
    async (input: TrackedItemInput) => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("user_tracked_items")
        .insert({ ...input, user_id: user.id })
        .select()
        .single();
      if (error) throw error;

      setItems((prev) => [...prev, data as TrackedItem]);
      return data as TrackedItem;
    },
    [setItems]
  );

  const updateItem = useCallback(
    async (itemId: string, updates: Partial<TrackedItemInput>) => {
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
      );

      const { error } = await supabase
        .from("user_tracked_items")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) {
        console.error("Failed to update tracked item:", error);
        deleteCached(ITEMS_CACHE_KEY);
        await fetchItems();
        throw error;
      }
    },
    [setItems, fetchItems]
  );

  /**
   * Deletes the item AND its logs (cascade). Only for items logged by mistake
   * — stopping something should use is_enabled, which preserves history.
   */
  const deleteItem = useCallback(
    async (itemId: string) => {
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      const { error } = await supabase
        .from("user_tracked_items")
        .delete()
        .eq("id", itemId);
      if (error) {
        deleteCached(ITEMS_CACHE_KEY);
        await fetchItems();
        throw error;
      }
    },
    [setItems, fetchItems]
  );

  const supplements = useMemo(
    () => items.filter((i) => i.kind === "supplement"),
    [items]
  );
  const medications = useMemo(
    () => items.filter((i) => i.kind === "medication"),
    [items]
  );

  return {
    items,
    supplements,
    medications,
    logs,
    available,
    isLoading,
    setDayLog,
    setDosesTaken,
    fillFromDate,
    createItem,
    updateItem,
    deleteItem,
    refetch: fetchItems,
  };
}
