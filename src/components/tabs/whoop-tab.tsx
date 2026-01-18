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
import { Loader2 } from "lucide-react";

export function WhoopTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");

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
          <div className="flex justify-center pt-2">
            <WhoopConnectButton
              isConnected={true}
              isLoading={isStatusLoading}
              isSyncing={isSyncing}
              onConnect={connect}
              onDisconnect={disconnect}
              onSync={() => sync(7)}
            />
          </div>
        </>
      )}
    </div>
  );
}
