"use client";

import { Zap } from "lucide-react";

interface StrainCardProps {
  strainScore: number | null;
  kilojoules: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

function getStrainColor(strain: number): string {
  if (strain >= 18) return "text-red-500";
  if (strain >= 14) return "text-orange-500";
  if (strain >= 10) return "text-yellow-500";
  return "text-green-500";
}

function kiloJoulesToCalories(kj: number): number {
  return Math.round(kj / 4.184);
}

export function StrainCard({
  strainScore,
  kilojoules,
  avgHeartRate,
  maxHeartRate,
}: StrainCardProps) {
  const hasData = strainScore !== null;
  const maxStrain = 21; // Whoop max strain is 21

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-5 w-5 text-amber-500" />
        <h2 className="font-semibold">Strain</h2>
      </div>

      {hasData ? (
        <div className="space-y-4">
          {/* Strain Score */}
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-3xl font-bold ${getStrainColor(strainScore)}`}>
                {strainScore.toFixed(1)}
              </p>
              <p className="text-sm text-muted-foreground">Day Strain</p>
            </div>
            {kilojoules !== null && (
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {kiloJoulesToCalories(kilojoules).toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground">Calories</p>
              </div>
            )}
          </div>

          {/* Strain Bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Strain Level</span>
              <span>{strainScore.toFixed(1)} / {maxStrain}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all bg-gradient-to-r from-green-500 via-yellow-500 via-orange-500 to-red-500"
                style={{ width: `${(strainScore / maxStrain) * 100}%` }}
              />
            </div>
          </div>

          {/* Heart Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Avg HR</p>
              <p className="text-lg font-semibold">
                {avgHeartRate !== null ? `${avgHeartRate} bpm` : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Max HR</p>
              <p className="text-lg font-semibold">
                {maxHeartRate !== null ? `${maxHeartRate} bpm` : "--"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-24 rounded border-2 border-dashed border-muted flex items-center justify-center text-sm text-muted-foreground">
          No strain data
        </div>
      )}
    </div>
  );
}
