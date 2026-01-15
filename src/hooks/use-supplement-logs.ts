"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";

export interface SupplementLog {
  id: string;
  user_id: string;
  date: string;
  supplement_name: string;
  amount: number;
  unit: string;
  notes?: string;
  created_at: string;
}

export function useSupplementLogs(date: string) {
  const [logs, setLogs] = useState<SupplementLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("supplement_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", date)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setLogs((data as SupplementLog[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch supplement logs");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const addLog = async (
    supplementName: string,
    amount: number,
    unit: string,
    notes?: string
  ): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newLog = {
        user_id: user.id,
        date,
        supplement_name: supplementName,
        amount,
        unit,
        notes,
      };

      // Optimistic update
      const tempId = crypto.randomUUID();
      setLogs((prev) => [
        ...prev,
        { ...newLog, id: tempId, created_at: new Date().toISOString() },
      ]);

      const { data, error } = await supabase
        .from("supplement_logs")
        .insert(newLog)
        .select()
        .single();

      if (error) throw error;

      // Replace temp with real data
      setLogs((prev) =>
        prev.map((log) => (log.id === tempId ? (data as SupplementLog) : log))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add supplement log");
      fetchLogs(); // Revert on error
      throw err;
    }
  };

  const updateLog = async (
    id: string,
    updates: { amount?: number; notes?: string }
  ): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Optimistic update
      setLogs((prev) =>
        prev.map((log) => (log.id === id ? { ...log, ...updates } : log))
      );

      const { error } = await supabase
        .from("supplement_logs")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update supplement log");
      fetchLogs(); // Revert on error
      throw err;
    }
  };

  const deleteLog = async (id: string): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Optimistic update
      setLogs((prev) => prev.filter((log) => log.id !== id));

      const { error } = await supabase
        .from("supplement_logs")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete supplement log");
      fetchLogs(); // Revert on error
      throw err;
    }
  };

  return {
    logs,
    isLoading,
    error,
    addLog,
    updateLog,
    deleteLog,
    refetch: fetchLogs,
  };
}
