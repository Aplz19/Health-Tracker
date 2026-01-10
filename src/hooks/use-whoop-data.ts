"use client";

import { useState, useEffect, useCallback } from "react";
import type { WhoopDayData } from "@/lib/whoop/types";

export function useWhoopData(date: string) {
  const [data, setData] = useState<WhoopDayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!date) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/whoop/sync?date=${date}`);
      const result = await response.json();

      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
      }
    } catch {
      setError("Failed to fetch Whoop data");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [date]);

  const sync = useCallback(async (days: number = 7) => {
    setIsSyncing(true);
    setError(null);

    try {
      const response = await fetch("/api/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });

      const result = await response.json();

      if (result.error) {
        setError(result.error);
        return false;
      }

      // Refetch data for current date after sync
      await fetchData();
      return true;
    } catch {
      setError("Failed to sync Whoop data");
      return false;
    } finally {
      setIsSyncing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    isLoading,
    isSyncing,
    error,
    sync,
    refetch: fetchData,
  };
}
