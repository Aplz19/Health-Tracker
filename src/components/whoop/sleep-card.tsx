"use client";

import { Moon } from "lucide-react";

interface SleepCardProps {
  sleepScore: number | null;
  sleepDurationMinutes: number | null;
  sleepConsistency: number | null;
  sleepEfficiency: number | null;
  sleepNeededMinutes: number | null;
  respiratoryRate: number | null;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getSleepColor(score: number): string {
  if (score >= 85) return "text-green-500";
  if (score >= 70) return "text-yellow-500";
  return "text-red-500";
}

export function SleepCard({
  sleepScore,
  sleepDurationMinutes,
  sleepConsistency,
  sleepEfficiency,
  sleepNeededMinutes,
  respiratoryRate,
}: SleepCardProps) {
  const hasData = sleepDurationMinutes !== null;

  // Calculate hours vs hours needed percentage
  const hoursVsNeeded =
    sleepDurationMinutes && sleepNeededMinutes
      ? Math.round((sleepDurationMinutes / sleepNeededMinutes) * 100)
      : null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Moon className="h-5 w-5 text-indigo-500" />
        <h2 className="font-semibold">Sleep</h2>
      </div>

      {hasData ? (
        <div className="space-y-4">
          {/* Duration and Score */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold">
                {formatDuration(sleepDurationMinutes)}
              </p>
              <p className="text-sm text-muted-foreground">Total sleep</p>
            </div>
            {sleepScore !== null && (
              <div className="text-right">
                <p className={`text-2xl font-bold ${getSleepColor(sleepScore)}`}>
                  {sleepScore}%
                </p>
                <p className="text-sm text-muted-foreground">Performance</p>
              </div>
            )}
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Sleep Goal Progress</span>
              <span>{sleepScore !== null ? `${sleepScore}%` : "--"}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  sleepScore !== null
                    ? sleepScore >= 85
                      ? "bg-green-500"
                      : sleepScore >= 70
                      ? "bg-yellow-500"
                      : "bg-red-500"
                    : "bg-muted"
                }`}
                style={{ width: `${Math.min(sleepScore ?? 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Consistency</p>
              <p className="text-lg font-semibold">
                {sleepConsistency !== null ? `${Math.round(sleepConsistency)}%` : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Efficiency</p>
              <p className="text-lg font-semibold">
                {sleepEfficiency !== null ? `${Math.round(sleepEfficiency)}%` : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Hours vs Needed</p>
              <p className="text-lg font-semibold">
                {hoursVsNeeded !== null ? `${hoursVsNeeded}%` : "--"}
              </p>
            </div>
            <div className="bg-muted/50 rounded p-2">
              <p className="text-xs text-muted-foreground">Resp. Rate</p>
              <p className="text-lg font-semibold">
                {respiratoryRate !== null ? `${respiratoryRate.toFixed(1)}` : "--"}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-24 rounded border-2 border-dashed border-muted flex items-center justify-center text-sm text-muted-foreground">
          No sleep data
        </div>
      )}
    </div>
  );
}
