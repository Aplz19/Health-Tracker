"use client";

import { useState } from "react";
import { X, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHabitPreferencesContext } from "@/contexts/habit-preferences-context";
import { validateChoiceOptions } from "@/lib/habits/logic";
import { HabitIcon } from "@/components/habits/habit-icon";
import type { HabitValueKind, ResolvedHabit } from "@/types/habits";

// Full-screen habit editor (fullscreenOnMobile sheet on phones, centered card
// on desktop). Used for both editing an existing habit and creating a new
// one. Replaces the old tiny config dialog; the value-kind picker is a
// segmented control (2x2 grid of 44px+ buttons), not a dropdown.

const KIND_OPTIONS: {
  kind: HabitValueKind;
  label: string;
  description: string;
}[] = [
  { kind: "checkbox", label: "Checkbox", description: "Did / didn't" },
  { kind: "number", label: "Number", description: "An amount, optional goal" },
  { kind: "scale", label: "Scale 1-5", description: "Subjective rating" },
  { kind: "choice", label: "Choice", description: "Pick one option" },
];

interface EditorState {
  name: string;
  emoji: string;
  unit: string;
  valueKind: HabitValueKind;
  goal: string;
  step: string;
  options: string[];
}

function stateFromHabit(habit: ResolvedHabit | null): EditorState {
  return {
    name: habit?.name ?? "",
    emoji: habit?.emoji ?? "",
    unit: habit?.unit ?? "",
    valueKind: habit?.valueKind ?? "checkbox",
    goal: habit?.goalAmount != null ? String(habit.goalAmount) : "",
    step: habit?.step != null ? String(habit.step) : "1",
    options: habit?.choiceOptions ?? [],
  };
}

export function HabitEditorDialog({
  habit, // null = create new
  open,
  onOpenChange,
}: {
  habit: ResolvedHabit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { v2Available, addHabit, updateHabit, archiveHabit } =
    useHabitPreferencesContext();

  const isNew = habit === null;
  const [state, setState] = useState<EditorState>(() => stateFromHabit(habit));
  const [optionDraft, setOptionDraft] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const kindChanged = !isNew && state.valueKind !== habit.valueKind;
  // Legacy fallback can only express checkbox/number on the built-ins.
  const selectableKinds = v2Available
    ? KIND_OPTIONS
    : KIND_OPTIONS.filter((o) => o.kind === "checkbox" || o.kind === "number");
  const identityEditable = v2Available;

  const set = (patch: Partial<EditorState>) => {
    setValidationError(null);
    setState((prev) => ({ ...prev, ...patch }));
  };

  const addOption = () => {
    const value = optionDraft.trim();
    if (!value) return;
    set({ options: [...state.options, value] });
    setOptionDraft("");
  };

  const handleSave = async () => {
    const name = state.name.trim();
    if (!name) {
      setValidationError("Give the habit a name");
      return;
    }

    let choiceOptions: string[] | null = null;
    if (state.valueKind === "choice") {
      const result = validateChoiceOptions(state.options);
      if (result.error) {
        setValidationError(result.error);
        return;
      }
      choiceOptions = result.options;
    }

    const goalAmount =
      state.valueKind === "number" && state.goal.trim() !== ""
        ? parseFloat(state.goal) || null
        : null;
    const step = parseFloat(state.step) || 1;
    const emoji = state.emoji.trim() || null;
    const unit = state.valueKind === "number" ? state.unit.trim() : "";

    if (isNew) {
      await addHabit({
        name,
        emoji,
        unit,
        valueKind: state.valueKind,
        goalAmount,
        step,
        choiceOptions,
      });
    } else {
      await updateHabit(habit.key, {
        name,
        emoji,
        unit,
        valueKind: state.valueKind,
        goalAmount,
        step,
        choiceOptions,
      });
    }
    onOpenChange(false);
  };

  const handleArchive = async () => {
    if (!habit) return;
    if (!confirmArchive) {
      setConfirmArchive(true);
      return;
    }
    await archiveHabit(habit.key);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent fullscreenOnMobile className="sm:max-w-md">
        <DialogHeader className="flex-shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            {!isNew && <HabitIcon habit={habit} />}
            {isNew ? "New Habit" : `Edit ${habit.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          {/* Identity: emoji + name */}
          <div className="space-y-2">
            <Label htmlFor="habit-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="habit-emoji"
                value={state.emoji}
                onChange={(e) => set({ emoji: e.target.value })}
                placeholder="🔥"
                maxLength={4}
                disabled={!identityEditable}
                className="h-11 w-14 text-center text-xl"
                aria-label="Emoji"
              />
              <Input
                id="habit-name"
                value={state.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Arrival Energy"
                disabled={!identityEditable}
                className="h-11 flex-1"
              />
            </div>
          </div>

          {/* Value kind: segmented control */}
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Value type">
              {selectableKinds.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={state.valueKind === option.kind}
                  onClick={() => set({ valueKind: option.kind })}
                  className={`flex min-h-14 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors ${
                    state.valueKind === option.kind
                      ? "border-primary bg-primary/10"
                      : "bg-background hover:bg-accent"
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
            {kindChanged && (
              <p className="text-xs text-muted-foreground">
                Past logs keep the type they were recorded with - changing the
                type only affects new entries.
              </p>
            )}
            {!v2Available && (
              <p className="text-xs text-muted-foreground">
                Scale, choice, and custom habits unlock once{" "}
                <code>sql/add_habits_v2.sql</code> is applied in Supabase.
              </p>
            )}
          </div>

          {/* Number config */}
          {state.valueKind === "number" && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2">
                <Label htmlFor="habit-goal">Goal</Label>
                <Input
                  id="habit-goal"
                  type="number"
                  inputMode="decimal"
                  value={state.goal}
                  onChange={(e) => set({ goal: e.target.value })}
                  placeholder="none"
                  min={0}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="habit-unit">Unit</Label>
                <Input
                  id="habit-unit"
                  value={state.unit}
                  onChange={(e) => set({ unit: e.target.value })}
                  placeholder="min"
                  disabled={!identityEditable}
                  className="h-11"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="habit-step">Step</Label>
                <Input
                  id="habit-step"
                  type="number"
                  inputMode="decimal"
                  value={state.step}
                  onChange={(e) => set({ step: e.target.value })}
                  min={0}
                  className="h-11"
                />
              </div>
              <p className="col-span-3 text-xs text-muted-foreground">
                Setting a goal adds a one-tap complete checkbox that logs the
                goal amount.
              </p>
            </div>
          )}

          {/* Choice options editor */}
          {state.valueKind === "choice" && (
            <div className="space-y-2">
              <Label htmlFor="habit-option">Options</Label>
              <div className="flex flex-wrap gap-1.5">
                {state.options.map((option, index) => (
                  <span
                    key={`${option}-${index}`}
                    className="flex h-9 items-center gap-1 rounded-full border bg-accent px-3 text-sm capitalize"
                  >
                    {option}
                    <button
                      type="button"
                      aria-label={`Remove ${option}`}
                      onClick={() =>
                        set({ options: state.options.filter((_, i) => i !== index) })
                      }
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  id="habit-option"
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  placeholder="e.g. green"
                  className="h-11 flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addOption}
                  className="h-11"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </Button>
              </div>
            </div>
          )}

          {validationError && (
            <p className="text-sm text-destructive">{validationError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {!isNew && v2Available && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleArchive}
              className="h-11 text-destructive hover:text-destructive"
            >
              <Archive className="h-4 w-4" />
              {confirmArchive ? "Tap again to archive" : "Archive"}
            </Button>
          )}
          <Button type="button" onClick={handleSave} className="h-11 flex-1">
            {isNew ? "Create Habit" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
