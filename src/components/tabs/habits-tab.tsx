"use client";

import { useState } from "react";
import { useDate } from "@/contexts/date-context";
import { format } from "date-fns";
import { NotebookPen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useHabitPreferencesContext } from "@/contexts/habit-preferences-context";
import { useHabitLogs } from "@/hooks/use-habit-logs";
import { useDailyNote } from "@/hooks/use-daily-note";
import { interpretLog } from "@/lib/habits/logic";
import { CHOICE_COLOR_CLASSES } from "@/lib/habits/choice-colors";
import { HabitIcon } from "@/components/habits/habit-icon";
import type { HabitLog, ResolvedHabit } from "@/types/habits";

// ---------------------------------------------------------------------------
// Row renderers - one per value kind. All tap targets are >= 44px.
// ---------------------------------------------------------------------------

function RowShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
      {children}
    </div>
  );
}

function RowLabel({ habit, htmlFor }: { habit: ResolvedHabit; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 cursor-pointer">
      <HabitIcon habit={habit} className="h-5 w-5" />
      <span className="font-medium">{habit.name}</span>
    </label>
  );
}

// checkbox kind: explicit did / didn't
function CheckboxRow({
  habit,
  log,
  onToggle,
}: {
  habit: ResolvedHabit;
  log: HabitLog | undefined;
  onToggle: () => void;
}) {
  const { value } = interpretLog("checkbox", log);
  const isChecked = value === true;

  return (
    <RowShell>
      <div className="flex items-center gap-3">
        <Checkbox
          id={`habit-${habit.key}`}
          checked={isChecked}
          onCheckedChange={onToggle}
          className="h-5 w-5"
        />
        <RowLabel habit={habit} htmlFor={`habit-${habit.key}`} />
      </div>
      {isChecked && <span className="text-sm text-green-500">Done</span>}
    </RowShell>
  );
}

// number kind: amount input; with a goal it also gets the one-tap
// quick-complete checkbox (the old "goal mode" behavior, preserved)
function NumberRow({
  habit,
  log,
  onQuickComplete,
  onSetAmount,
}: {
  habit: ResolvedHabit;
  log: HabitLog | undefined;
  onQuickComplete: () => void;
  onSetAmount: (value: number) => void;
}) {
  const { logged, value } = interpretLog("number", log);
  const amount = logged && typeof value === "number" ? value : 0;
  const hasGoal = habit.goalAmount !== null && habit.goalAmount > 0;
  const goalMet = hasGoal && amount >= (habit.goalAmount as number);
  // Parent keys this row by `${key}:${amount}`, so a saved amount (or a
  // quick-complete) remounts with a fresh draft - no sync effect needed.
  const [draft, setDraft] = useState(amount > 0 ? amount.toString() : "");

  const commitDraft = () => {
    const numValue = parseFloat(draft) || 0;
    if (numValue !== amount) onSetAmount(numValue);
  };

  return (
    <RowShell>
      <div className="flex items-center gap-3">
        {hasGoal && (
          <Checkbox
            id={`habit-${habit.key}`}
            checked={goalMet}
            onCheckedChange={onQuickComplete}
            className="h-5 w-5"
          />
        )}
        <RowLabel habit={habit} htmlFor={hasGoal ? `habit-${habit.key}` : undefined} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={draft}
          placeholder="0"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-10 w-20 text-center"
          min={0}
          step={habit.step}
        />
        <span className="text-sm text-muted-foreground">
          {hasGoal ? `/ ${habit.goalAmount} ` : ""}
          {habit.unit}
        </span>
      </div>
    </RowShell>
  );
}

// scale kind: five 1-5 segments; tapping the selected value clears back to NA
function ScaleRow({
  habit,
  log,
  onSelect,
}: {
  habit: ResolvedHabit;
  log: HabitLog | undefined;
  onSelect: (value: number | null) => void;
}) {
  const { logged, value } = interpretLog("scale", log);
  const selected = logged && typeof value === "number" ? value : null;

  return (
    <RowShell>
      <RowLabel habit={habit} />
      <div className="flex items-center gap-1" role="radiogroup" aria-label={habit.name}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={selected === n}
            onClick={() => onSelect(selected === n ? null : n)}
            className={`h-11 w-11 rounded-md border text-sm font-medium transition-colors ${
              selected === n
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </RowShell>
  );
}

// choice kind: option chips; tapping the selected option clears back to NA.
// Each option lights up in its own configured color when selected.
function ChoiceRow({
  habit,
  log,
  onSelect,
}: {
  habit: ResolvedHabit;
  log: HabitLog | undefined;
  onSelect: (option: string | null) => void;
}) {
  const { logged, value } = interpretLog("choice", log);
  const selected = logged && typeof value === "string" ? value : null;
  const options = habit.choiceOptions ?? [];

  return (
    <RowShell>
      <RowLabel habit={habit} />
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={habit.name}>
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected === option.label}
            onClick={() => onSelect(selected === option.label ? null : option.label)}
            className={`h-11 rounded-full border px-4 text-sm font-medium capitalize transition-colors ${
              selected === option.label
                ? CHOICE_COLOR_CLASSES[option.color].chip
                : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </RowShell>
  );
}

// ---------------------------------------------------------------------------
// Day note (daily_notes table; hidden until the v2 migration is applied)
// ---------------------------------------------------------------------------

function DayNote({ date }: { date: string }) {
  const { note, setNote, saveNote, available } = useDailyNote(date);

  if (!available) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <NotebookPen className="h-4 w-4" />
        Day note
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => saveNote(note)}
        placeholder="Anything worth remembering about today - free form, no structure needed."
        className="min-h-24 text-base"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab
// ---------------------------------------------------------------------------

export function HabitsTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");

  const {
    getEnabledHabits,
    v2Available,
    isLoading: isPrefsLoading,
  } = useHabitPreferencesContext();
  const enabledHabits = getEnabledHabits();

  const {
    getLogForHabit,
    toggleCheckbox,
    quickCompleteNumber,
    setNumberAmount,
    setScaleValue,
    setChoiceValue,
    isLoading: isLogsLoading,
  } = useHabitLogs(dateString, enabledHabits, v2Available);

  const isLoading = isPrefsLoading || isLogsLoading;

  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <div className="rounded-lg border bg-card px-4 py-8 text-center">
            <span className="text-sm text-muted-foreground">Loading habits...</span>
          </div>
        ) : enabledHabits.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">No habits tracked yet</p>
            <p className="text-xs text-muted-foreground">
              Add habits to track in Settings
            </p>
          </div>
        ) : (
          enabledHabits.map((habit) => {
            const log = getLogForHabit(habit.key);
            switch (habit.valueKind) {
              case "checkbox":
                return (
                  <CheckboxRow
                    key={habit.key}
                    habit={habit}
                    log={log}
                    onToggle={() => toggleCheckbox(habit.key)}
                  />
                );
              case "number": {
                const numberValue = interpretLog("number", log).value;
                return (
                  <NumberRow
                    key={`${habit.key}:${typeof numberValue === "number" ? numberValue : 0}`}
                    habit={habit}
                    log={log}
                    onQuickComplete={() =>
                      quickCompleteNumber(habit.key, habit.goalAmount ?? 0)
                    }
                    onSetAmount={(value) => setNumberAmount(habit.key, value)}
                  />
                );
              }
              case "scale":
                return (
                  <ScaleRow
                    key={habit.key}
                    habit={habit}
                    log={log}
                    onSelect={(value) => setScaleValue(habit.key, value)}
                  />
                );
              case "choice":
                return (
                  <ChoiceRow
                    key={habit.key}
                    habit={habit}
                    log={log}
                    onSelect={(option) => setChoiceValue(habit.key, option)}
                  />
                );
            }
          })
        )}
      </div>

      <DayNote date={dateString} />
    </div>
  );
}
