"use client";

import { useState, useEffect } from "react";
import { useDate } from "@/contexts/date-context";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useHabitPreferencesContext } from "@/contexts/habit-preferences-context";
import { useHabitLogs } from "@/hooks/use-habit-logs";
import type { UserHabit } from "@/types/habits";

// Checkbox mode - just a checkbox to mark as done
function CheckboxHabitRow({
  habit,
  amount,
  onToggle,
}: {
  habit: UserHabit;
  amount: number;
  onToggle: (checked: boolean) => void;
}) {
  const isChecked = amount > 0;
  const Icon = habit.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`checkbox-${habit.definition.key}`}
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <label
          htmlFor={`checkbox-${habit.definition.key}`}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Icon className={`h-5 w-5 ${habit.definition.color}`} />
          <span className="font-medium">{habit.definition.label}</span>
        </label>
      </div>
      {isChecked && (
        <span className="text-sm text-green-500">Done</span>
      )}
    </div>
  );
}

// Goal mode - checkbox that tracks a specific goal amount
function GoalHabitRow({
  habit,
  amount,
  onToggle,
}: {
  habit: UserHabit;
  amount: number;
  onToggle: (checked: boolean) => void;
}) {
  const isChecked = amount >= habit.goalAmount;
  const Icon = habit.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Checkbox
          id={`goal-${habit.definition.key}`}
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <label
          htmlFor={`goal-${habit.definition.key}`}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Icon className={`h-5 w-5 ${habit.definition.color}`} />
          <span className="font-medium">{habit.definition.label}</span>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-sm ${isChecked ? "text-green-500" : "text-muted-foreground"}`}>
          {amount}
        </span>
        <span className="text-xs text-muted-foreground">
          / {habit.goalAmount} {habit.definition.unit}
        </span>
      </div>
    </div>
  );
}

// Manual mode - number input
function ManualHabitRow({
  habit,
  amount,
  onUpdate,
}: {
  habit: UserHabit;
  amount: number;
  onUpdate: (value: number) => void;
}) {
  const [value, setValue] = useState(amount.toString());

  useEffect(() => {
    setValue(amount.toString());
  }, [amount]);

  const handleBlur = () => {
    const numValue = parseFloat(value) || 0;
    if (numValue !== amount) {
      onUpdate(numValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const Icon = habit.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${habit.definition.color}`} />
        <span className="font-medium">{habit.definition.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-20 h-8 text-center"
          min={0}
          step={habit.definition.step}
        />
        <span className="text-sm text-muted-foreground w-12">
          {habit.definition.unit}
        </span>
      </div>
    </div>
  );
}

// Wrapper that renders the right component based on tracking mode
function HabitRow({
  habit,
  amount,
  onUpdate,
  onToggle,
}: {
  habit: UserHabit;
  amount: number;
  onUpdate: (value: number) => void;
  onToggle: (checked: boolean) => void;
}) {
  if (habit.trackingMode === "checkbox") {
    return (
      <CheckboxHabitRow
        habit={habit}
        amount={amount}
        onToggle={onToggle}
      />
    );
  }

  if (habit.trackingMode === "goal") {
    return (
      <GoalHabitRow
        habit={habit}
        amount={amount}
        onToggle={onToggle}
      />
    );
  }

  return (
    <ManualHabitRow
      habit={habit}
      amount={amount}
      onUpdate={onUpdate}
    />
  );
}

export function HabitsTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");

  const { getEnabledHabits, isLoading: isPrefsLoading } = useHabitPreferencesContext();
  const enabledHabits = getEnabledHabits();

  const {
    getLogForHabit,
    updateHabitLog,
    toggleHabit,
    isLoading: isLogsLoading,
  } = useHabitLogs(dateString);

  const isLoading = isPrefsLoading || isLogsLoading;

  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      {/* Habits List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center">
            <span className="text-sm text-muted-foreground">Loading habits...</span>
          </div>
        ) : enabledHabits.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No habits tracked yet
            </p>
            <p className="text-xs text-muted-foreground">
              Add habits to track in Settings
            </p>
          </div>
        ) : (
          enabledHabits.map((habit) => {
            const log = getLogForHabit(habit.definition.key);
            const amount = log?.amount ?? 0;

            return (
              <HabitRow
                key={habit.definition.key}
                habit={habit}
                amount={amount}
                onUpdate={(value) => updateHabitLog(habit.definition.key, value)}
                onToggle={(checked) => {
                  const goalAmount = habit.trackingMode === "checkbox" ? 1 : habit.goalAmount;
                  toggleHabit(habit.definition.key, goalAmount);
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
