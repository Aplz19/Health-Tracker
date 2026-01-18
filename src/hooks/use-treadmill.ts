"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { TreadmillSession, CardioExerciseType } from "@/lib/supabase/types";

export function useTreadmill(date: string) {
  const [sessions, setSessions] = useState<TreadmillSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("treadmill_sessions")
        .select("*")
        .eq("date", date)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setSessions((data as TreadmillSession[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch treadmill sessions");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const addSession = async (exerciseType: CardioExerciseType, data?: {
    duration_minutes?: number;
    incline?: number;
    speed?: number;
    notes?: string | null;
  }) => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: newSession, error } = await supabase
        .from("treadmill_sessions")
        .insert({
          user_id: user.id,
          date,
          exercise_type: exerciseType,
          duration_minutes: data?.duration_minutes ?? 30,
          incline: data?.incline ?? 0,
          speed: data?.speed ?? 3.0,
          notes: data?.notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      setSessions((prev) => [...prev, newSession as TreadmillSession]);
      return newSession;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add cardio session";
      setError(message);
      throw err;
    }
  };

  const updateSession = async (
    id: string,
    updates: Partial<Pick<TreadmillSession, "duration_minutes" | "incline" | "speed" | "notes">>
  ) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("treadmill_sessions")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      setSessions((prev) =>
        prev.map((session) =>
          session.id === id ? { ...session, ...updates } : session
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update treadmill session";
      setError(message);
      throw err;
    }
  };

  const deleteSession = async (id: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("treadmill_sessions")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setSessions((prev) => prev.filter((session) => session.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete treadmill session";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return {
    sessions,
    isLoading,
    error,
    addSession,
    updateSession,
    deleteSession,
    refetch: fetchSessions,
  };
}
