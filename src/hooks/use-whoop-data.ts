"use client";

import { useState, useEffect, useCallback } from "react";
import { getCached, hasCached, setCached } from "@/lib/client-cache";
import type { WhoopDayData } from "@/lib/whoop/types";

export function useWhoopData(date: string) {
  const cacheKey = `whoop:${date}`;
  const [data, setData] = useState<WhoopDayData | null>(
    () => getCached<WhoopDayData | null>(cacheKey) ?? null
  );
  const [isLoading, setIsLoading] = useState(() => !hasCached(cacheKey));
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!date) return;

    // Serve cached data instantly; only show a loading state on first visit.
    // null is a valid cached value ("no Whoop data for this day").
    if (!hasCached(cacheKey)) setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/whoop/sync?date=${date}`);
      const result = await response.json();

      if (result.error) {
        setError(result.error);
        setData(null);
      } else {
        setData(result.data);
        setCached(cacheKey, result.data);
      }
    } catch {
      setError("Failed to fetch Whoop data");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [date, cacheKey]);

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
    // On date change: swap in cached data instantly, then revalidate.
    const cached = getCached<WhoopDayData | null>(cacheKey);
    setData(cached ?? null);
    setIsLoading(!hasCached(cacheKey));
    fetchData();
  }, [cacheKey, fetchData]);

  return {
    data,
    isLoading,
    isSyncing,
    error,
    sync,
    refetch: fetchData,
  };
}
