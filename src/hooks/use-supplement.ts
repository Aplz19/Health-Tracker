"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

interface SupplementLog {
  id: string;
  user_id: string;
  date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export function useSupplement(tableName: string, date: string) {
  const [amount, setAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasRecord, setHasRecord] = useState(false);

  const fetchSupplement = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
      } else if (error) {
        throw error;
      } else {
        setHasRecord(true);
        setAmount((data as SupplementLog)?.amount ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to fetch ${tableName}`);
    } finally {
      setIsLoading(false);
    }
  }, [tableName, date]);

  const updateAmount = async (newAmount: number) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from(tableName)
    .select("amount")
    .eq("date", yesterdayDate)
    .eq("user_id", user.id)
    .single();

  return (data as SupplementLog | null)?.amount ?? 0;
}
