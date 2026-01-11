"use client";

import { useState, useCallback } from "react";
import type { DailySummaryData, DailySummary } from "@/lib/daily-summary/types";

export function useDailySummary() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch existing summary for a date
  const fetchSummary = useCallback(async (date: string): Promise<DailySummary | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily-summary?date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to fetch summary";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync (generate/update) summary for a single date
  const syncDate = useCallback(async (date: string): Promise<DailySummaryData | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.summary;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync summary";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sync multiple dates
  const syncDateRange = useCallback(async (startDate: string, endDate: string): Promise<DailySummaryData[]> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.summaries || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sync summaries";
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    fetchSummary,
    syncDate,
    syncDateRange,
  };
}
