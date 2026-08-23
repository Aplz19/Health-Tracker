"use client";

import { Switch } from "@/components/ui/switch";
import { useHabits } from "@/hooks/use-habits";
import { useHabitDashboardPreferences } from "@/hooks/use-habit-dashboard-preferences";

/**
 * Choose which habits appear as counts on the analytics tab.
 *
 * Separate from the metric list above because these are counts, not charted
 * series -- they share the analytics tab but not the metric pipeline. Habits
 * default to shown, so this only ever records an opt-out.
 */
export function HabitDashboardSettings() {
  const { getEnabledHabits, isLoading: habitsLoading } = useHabits();
  const { isEnabled, setHabitEnabled, isLoading: prefsLoading } = useHabitDashboardPreferences();

  const habits = getEnabledHabits();

  if (habitsLoading || prefsLoading) {
    return (
      <div className="rounded-lg border p-4 text-center">
        <span className="text-sm text-muted-foreground">Loading habits...</span>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Habit Counts</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Choose which habits show as a count on the analytics tab. Tapping a count
        there switches it to a percentage of the selected time range.
      </p>

      {habits.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed p-4 text-center">
          <p className="text-sm text-muted-foreground">
            No habits yet. Add one in Settings → Habits.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {habits.map((habit) => (
            <div
              key={habit.key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <span className="text-sm">
                {habit.emoji ? `${habit.emoji} ` : ""}
                {habit.name}
              </span>
              <Switch
                checked={isEnabled(habit.key)}
                onCheckedChange={(checked) => {
                  void setHabitEnabled(habit.key, checked);
                }}
                aria-label={`Show ${habit.name} on the analytics tab`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
