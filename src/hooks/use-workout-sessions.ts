"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { WorkoutSession, CachedWhoopWorkout } from "@/lib/supabase/types";

export function useWorkoutSessions(date: string) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workout_sessions")
        .select("*")
        .eq("date", date)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch session");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  // Create a new workout session for the date
  const startSession = async (notes?: string): Promise<WorkoutSession> => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: user.id,
          date,
          notes: notes || null,
        })
        .select()
        .single();

      if (error) throw error;
      setSession(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start session";
      setError(message);
      throw err;
    }
  };

  // Update session notes
  const updateNotes = async (notes: string | null) => {
    if (!session) throw new Error("No active session");
    setError(null);
    try {
      const { error } = await supabase
        .from("workout_sessions")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", session.id);

      if (error) throw error;
      setSession(prev => prev ? { ...prev, notes } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update notes";
      setError(message);
      throw err;
    }
  };

  // Link a Whoop workout to this session
  const linkWhoopWorkout = async (whoopWorkout: CachedWhoopWorkout) => {
    if (!session) throw new Error("No active session");
    setError(null);
    try {
      const updates = {
        whoop_workout_id: whoopWorkout.whoop_workout_id,
        start_time: whoopWorkout.start_time,
        end_time: whoopWorkout.end_time,
        strain: whoopWorkout.strain,
        avg_hr: whoopWorkout.avg_hr,
        max_hr: whoopWorkout.max_hr,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("workout_sessions")
        .update(updates)
        .eq("id", session.id);

      if (error) throw error;
      setSession(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to link workout";
      setError(message);
      throw err;
    }
  };

  // Unlink Whoop workout from session
  const unlinkWhoopWorkout = async () => {
    if (!session) throw new Error("No active session");
    setError(null);
    try {
      const updates = {
        whoop_workout_id: null,
        start_time: null,
        end_time: null,
        strain: null,
        avg_hr: null,
        max_hr: null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("workout_sessions")
        .update(updates)
        .eq("id", session.id);

      if (error) throw error;
      setSession(prev => prev ? { ...prev, ...updates } : null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unlink workout";
      setError(message);
      throw err;
    }
  };

  // Delete the session
  const deleteSession = async () => {
    if (!session) return;
    setError(null);
    try {
      const { error } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("id", session.id);

      if (error) throw error;
      setSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete session";
      setError(message);
      throw err;
    }
  };

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return {
    session,
    isLoading,
    error,
    startSession,
    updateNotes,
    linkWhoopWorkout,
    unlinkWhoopWorkout,
    deleteSession,
    refetch: fetchSession,
  };
}
