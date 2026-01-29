"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase/client";
import type { WorkoutSession, CachedWhoopWorkout } from "@/lib/supabase/types";

export function useWorkoutSessions(date: string) {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
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
        .order("created_at", { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch sessions");
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  // Create a new workout session for the date
  const startSession = async (name?: string, startTime?: string): Promise<WorkoutSession> => {
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("workout_sessions")
        .insert({
          user_id: user.id,
          date,
          notes: name || null,
          start_time: startTime || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setSessions(prev => [...prev, data]);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start session";
      setError(message);
      throw err;
    }
  };

  // Update session notes (name)
  const updateSessionNotes = async (sessionId: string, notes: string | null) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("workout_sessions")
        .update({ notes, updated_at: new Date().toISOString() })
        .eq("id", sessionId);

      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, notes } : s));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update notes";
      setError(message);
      throw err;
    }
  };

  // Link a Whoop workout to specific session
  const linkWhoopWorkout = async (sessionId: string, whoopWorkout: CachedWhoopWorkout) => {
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
        .eq("id", sessionId);

      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to link workout";
      setError(message);
      throw err;
    }
  };

  // Unlink Whoop workout from specific session
  const unlinkWhoopWorkout = async (sessionId: string) => {
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
        .eq("id", sessionId);

      if (error) throw error;
      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, ...updates } : s));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unlink workout";
      setError(message);
      throw err;
    }
  };

  // Delete specific session (CASCADE deletes exercises)
  const deleteSession = async (sessionId: string) => {
    setError(null);
    try {
      const { error } = await supabase
        .from("workout_sessions")
        .delete()
        .eq("id", sessionId);

      if (error) throw error;
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete session";
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
    startSession,
    updateSessionNotes,
    linkWhoopWorkout,
    unlinkWhoopWorkout,
    deleteSession,
    refetch: fetchSessions,
  };
}
