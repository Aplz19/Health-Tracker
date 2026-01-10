"use client";

import { Heart } from "lucide-react";

interface RecoveryCardProps {
  recoveryScore: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  spo2: number | null;
  skinTemp: number | null;
}

function getRecoveryColor(score: number): string {
  if (score >= 67) return "text-green-500";
  if (score >= 34) return "text-yellow-500";
  return "text-red-500";
}

function getRecoveryBgColor(score: number): string {
  if (score >= 67) return "bg-green-500";
  if (score >= 34) return "bg-yellow-500";
  return "bg-red-500";
}

export function RecoveryCard({
  recoveryScore,
  hrv,
  restingHeartRate,
  spo2,
  skinTemp,
}: RecoveryCardProps) {
  const hasData = recoveryScore !== null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Recovery</h2>
      </div>

      {hasData ? (
        <div className="space-y-4">
          {/* Recovery Score Circle */}
          <div className="flex items-center gap-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(recoveryScore / 100) * 226} 226`}
                  className={getRecoveryColor(recoveryScore)}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-bold ${getRecoveryColor(recoveryScore)}`}>
                  {recoveryScore}%
                </span>
              </div>
            </div>
            <div className="flex-1">
              <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getRecoveryBgColor(recoveryScore)} text-black`}>
                {recoveryScore >= 67 ? "Green" : recoveryScore >= 34 ? "Yellow" : "Red"}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {recoveryScore >= 67
                  ? "Ready for strain"
                  : recoveryScore >= 34
                  ? "Moderate activity"
                  : "Focus on recovery"}
              </p>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">HRV</p>
              <p className="text-lg font-semibold">
                {hrv !== null ? `${Math.round(hrv)} ms` : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Resting HR</p>
              <p className="text-lg font-semibold">
                {restingHeartRate !== null ? `${restingHeartRate} bpm` : "--"}
              </p>
            </div>
            {spo2 !== null && (
              <div className="bg-muted/50 rounded p-2">
                <p className="text-xs text-muted-foreground">SpO2</p>
                <p className="text-lg font-semibold">{spo2.toFixed(1)}%</p>
              </div>
            )}
            {skinTemp !== null && (
              <div className="bg-muted/50 rounded p-2">
                <p className="text-xs text-muted-foreground">Skin Temp</p>
                <p className="text-lg font-semibold">{skinTemp.toFixed(1)}°C</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="h-32 rounded border-2 border-dashed border-muted flex items-center justify-center text-sm text-muted-foreground">
          No recovery data
        </div>
      )}
    </div>
  );
}
