"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import { getCached, hasCached, setCached } from "@/lib/client-cache";

interface SupplementLog {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

interface SupplementCacheEntry {
  amount: number;
  hasRecord: boolean;
}

export function useSupplement(tableName: string, date: string, enabled: boolean = true) {
  const cacheKey = `supplement:${tableName}:${date}`;
  const cached0 = getCached<SupplementCacheEntry>(cacheKey);
  const [amount, setAmount] = useState<number>(cached0?.amount ?? 0);
  const [isLoading, setIsLoading] = useState(() => enabled && !hasCached(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState(cached0?.hasRecord ?? false);

  const fetchSupplement = useCallback(async () => {
    // Skip the query entirely for supplements the user isn't tracking. The
    // dietary tab instantiates a hook for every known supplement (rules of
    // hooks), so without this gate it would fire ~15 queries on every load.
    if (!enabled) {
      setIsLoading(false);
      setAmount(0);
      setHasRecord(false);
      return;
    }
    // Serve cache instantly (date/table changes), then revalidate silently.
    const cached = getCached<SupplementCacheEntry>(cacheKey);
    if (cached !== undefined) {
      setAmount(cached.amount);
      setHasRecord(cached.hasRecord);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from(tableName)
        .select("*")
        .eq("date", date)
        .eq("user_id", user.id)
        .single();

      if (error && error.code === "PGRST116") {
        // No record exists for today
        setHasRecord(false);
        setAmount(0);
        setCached(cacheKey, { amount: 0, hasRecord: false });
      } else if (error) {
        throw error;
      } else {
        const fetched = (data as SupplementLog)?.amount ?? 0;
        setHasRecord(true);
        setAmount(fetched);
        setCached(cacheKey, { amount: fetched, hasRecord: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to fetch ${tableName}`);
    } finally {
      setIsLoading(false);
    }
  }, [tableName, date, enabled, cacheKey]);

  const updateAmount = async (newAmount: number) => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from(tableName)
        .upsert(
          {
            user_id: user.id,
            date,
            amount: newAmount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,date" }
        );

      if (error) throw error;
      setAmount(newAmount);
      setHasRecord(true);
      setCached(cacheKey, { amount: newAmount, hasRecord: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to update ${tableName}`;
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchSupplement();
  }, [fetchSupplement]);

  return {
    amount,
    isLoading,
    error,
    hasRecord,
    updateAmount,
    refetch: fetchSupplement,
  };
}

// Helper to fetch yesterday's value for a specific table
export async function fetchYesterdayAmount(tableName: string, yesterdayDate: string): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return 0;

  const { data } = await supabase
    .from(tableName)
    .select("amount")
    .eq("date", yesterdayDate)
    .eq("user_id", user.id)
    .single();

  return (data as SupplementLog | null)?.amount ?? 0;
}
