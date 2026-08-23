"use client";

import { useState } from "react";
import type { HabitDashboardEntry } from "@/hooks/use-habit-dashboard";

/**
 * Habit counts over the selected analytics window.
 *
 * Numbers only, by design -- no sparklines, no charts. The question is "how
 * many days did I do this?", and a count answers it directly. Tapping a box
 * swaps the count for the share of days it represents, which is the same fact
 * expressed against the denominator.
 */

interface HabitDashboardProps {
  entries: HabitDashboardEntry[];
  isLoading: boolean;
}

export function HabitDashboard({ entries, isLoading }: HabitDashboardProps) {
  // Per-box, so several can be flipped to percentages at once.
  const [showingPercent, setShowingPercent] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setShowingPercent((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm text-muted-foreground">Loading habits…</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-medium mb-1">Habits</div>
        <div className="text-sm text-muted-foreground">
          No habits selected. Go to Settings → Analytics to choose which habits appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-medium">Habits</div>
        <div className="text-xs text-muted-foreground">tap for %</div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {entries.map((entry) => {
          const asPercent = showingPercent.has(entry.key);
          // Guard the denominator rather than rendering NaN.
          const percent =
            entry.totalDays > 0
              ? Math.round((entry.count / entry.totalDays) * 100)
              : 0;

          return (
            <button
              key={entry.key}
              onClick={() => toggle(entry.key)}
              className="rounded-lg border bg-background p-3 text-left hover:bg-muted/50 transition-colors min-h-[76px] flex flex-col justify-between"
              aria-label={`${entry.name}: ${entry.count} of ${entry.totalDays} days`}
            >
              <div className="text-[11px] leading-tight text-muted-foreground line-clamp-2">
                {entry.emoji ? `${entry.emoji} ` : ""}
                {entry.name}
              </div>
              <div className="mt-1">
                <span className="text-xl font-semibold tabular-nums">
                  {asPercent ? `${percent}%` : entry.count}
                </span>
                {/* Always show the denominator: a bare count is unreadable
                    without knowing the window it came from. */}
                <span className="ml-1 text-[11px] text-muted-foreground">
                  {asPercent ? `of ${entry.totalDays}d` : `/ ${entry.totalDays}d`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* The denominator is every day in the range, including days nothing was
          logged. Without saying so, "Ate Out 28%" reads as a rate when it is
          really a count against calendar days -- the sparse-truth rule applied
          to the display rather than the data. */}
      {entries.some((e) => e.loggedDays < e.totalDays) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Out of all {entries[0]?.totalDays} days in range, including days you
          didn&apos;t log. Logged:{" "}
          {Math.min(...entries.map((e) => e.loggedDays))}–
          {Math.max(...entries.map((e) => e.loggedDays))} days.
        </p>
      )}
    </div>
  );
}
