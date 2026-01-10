"use client";

import { useEffect } from "react";
import { useDate } from "@/contexts/date-context";
import { format } from "date-fns";
import { useWhoopStatus } from "@/hooks/use-whoop-status";
import { useWhoopData } from "@/hooks/use-whoop-data";
import { WhoopConnectButton } from "@/components/whoop/connect-button";
import { RecoveryCard } from "@/components/whoop/recovery-card";
import { SleepCard } from "@/components/whoop/sleep-card";
import { StrainCard } from "@/components/whoop/strain-card";
import { Loader2, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function WhoopTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [historySyncResult, setHistorySyncResult] = useState<string | null>(null);

  const {
    isConnected,
    isLoading: isStatusLoading,
    connect,
    disconnect,
    refetch: refetchStatus,
  } = useWhoopStatus();

  const {
    data,
    isLoading: isDataLoading,
    isSyncing,
    error,
    sync,
  } = useWhoopData(dateString);

  const syncHistoricalData = async () => {
    setIsSyncingHistory(true);
    setHistorySyncResult(null);
    try {
      // Sync from August 2025 to now (~160 days)
      const response = await fetch("/api/whoop/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 180 }),
      });
      const result = await response.json();
      if (result.success) {
        setHistorySyncResult(`Synced ${result.synced} days of data`);
      } else {
        setHistorySyncResult(`Error: ${result.error}`);
      }
    } catch (err) {
      setHistorySyncResult("Failed to sync historical data");
    } finally {
      setIsSyncingHistory(false);
    }
  };

  // Check for OAuth callback params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("whoop_connected");
    const whoopError = params.get("whoop_error");

    if (connected === "true") {
      // Clear URL params and refetch status
      window.history.replaceState({}, "", window.location.pathname);
      refetchStatus();
      // Auto-sync after connecting
      sync(7);
    } else if (whoopError) {
      console.error("Whoop connection error:", whoopError);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetchStatus, sync]);

  const isLoading = isStatusLoading || (isConnected && isDataLoading);

  return (
    <div className="space-y-4 p-4">
      {/* Date Header */}
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Not Connected State */}
      {!isLoading && !isConnected && (
        <section className="rounded-lg border bg-card p-6 text-center">
          <h2 className="font-semibold text-lg mb-2">Connect Your Whoop</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Link your Whoop account to see recovery, sleep, and strain data.
          </p>
          <WhoopConnectButton
            isConnected={false}
            isLoading={isStatusLoading}
            onConnect={connect}
            onDisconnect={disconnect}
          />
        </section>
      )}

      {/* Connected State */}
      {!isLoading && isConnected && (
        <>
          {/* Error Display */}
          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Data Cards */}
          <RecoveryCard
            recoveryScore={data?.recovery_score ?? null}
            hrv={data?.hrv_rmssd ?? null}
            restingHeartRate={data?.resting_heart_rate ?? null}
            spo2={data?.spo2_percentage ?? null}
            skinTemp={data?.skin_temp_celsius ?? null}
          />

          <SleepCard
            sleepScore={data?.sleep_score ?? null}
            sleepDurationMinutes={data?.sleep_duration_minutes ?? null}
            sleepConsistency={(data?.raw_data as { sleep?: { score?: { sleep_consistency_percentage?: number } } })?.sleep?.score?.sleep_consistency_percentage ?? null}
            sleepEfficiency={(data?.raw_data as { sleep?: { score?: { sleep_efficiency_percentage?: number } } })?.sleep?.score?.sleep_efficiency_percentage ?? null}
            sleepNeededMinutes={(() => {
              const sleepNeeded = (data?.raw_data as { sleep?: { score?: { sleep_needed?: { baseline_milli?: number; need_from_sleep_debt_milli?: number; need_from_recent_strain_milli?: number } } } })?.sleep?.score?.sleep_needed;
              if (!sleepNeeded) return null;
              const totalNeededMs = (sleepNeeded.baseline_milli || 0) + (sleepNeeded.need_from_sleep_debt_milli || 0) + (sleepNeeded.need_from_recent_strain_milli || 0);
              return Math.round(totalNeededMs / 60000);
            })()}
            respiratoryRate={(data?.raw_data as { sleep?: { score?: { respiratory_rate?: number } } })?.sleep?.score?.respiratory_rate ?? null}
          />

          <StrainCard
            strainScore={data?.strain_score ?? null}
            kilojoules={data?.kilojoules ?? null}
            avgHeartRate={data?.avg_heart_rate ?? null}
            maxHeartRate={data?.max_heart_rate ?? null}
          />

          {/* Actions */}
          <div className="space-y-3 pt-2">
            <div className="flex justify-center">
              <WhoopConnectButton
                isConnected={true}
                isLoading={isStatusLoading}
                isSyncing={isSyncing}
                onConnect={connect}
                onDisconnect={disconnect}
                onSync={() => sync(7)}
              />
            </div>

            {/* Sync Historical Data */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Sync Historical Data</p>
                  <p className="text-xs text-muted-foreground">
                    Load last 6 months of Whoop data
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncHistoricalData}
                  disabled={isSyncingHistory}
                >
                  {isSyncingHistory ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <History className="h-4 w-4 mr-2" />
                      Sync History
                    </>
                  )}
                </Button>
              </div>
              {historySyncResult && (
                <p className={`text-xs mt-2 ${historySyncResult.startsWith("Error") ? "text-red-500" : "text-green-500"}`}>
                  {historySyncResult}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
