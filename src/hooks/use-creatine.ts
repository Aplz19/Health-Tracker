"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

interface CreatineLog {
  id: string;
  date: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export function useCreatine(date: string) {
  const [amount, setAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCreatine = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("creatine_logs")
        .select("*")
        .eq("date", date)
        .single();

      if (error && error.code === "PGRST116") {
        // No record exists - create one with 0
        const { error: insertError } = await supabase
          .from("creatine_logs")
          .insert({ date, amount: 0 });

        if (insertError) throw insertError;
        setAmount(0);
      } else if (error) {
        throw error;
      } else {
        setAmount((data as CreatineLog)?.amount ?? 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch creatine");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const updateAmount = async (newAmount: number) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("creatine_logs")
        .upsert(
          {
            date,
            amount: newAmount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "date" }
        );

      if (error) throw error;
      setAmount(newAmount);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update creatine";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchCreatine();
  }, [fetchCreatine]);

  return {
    amount,
    isLoading,
    error,
    updateAmount,
    refetch: fetchCreatine,
  };
}
