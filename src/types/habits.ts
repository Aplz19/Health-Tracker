import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Habits v2 core types
// ---------------------------------------------------------------------------

// The shape of a habit's value. Snapshotted onto every log row so changing a
// habit's kind never rewrites history (see sql/add_habits_v2.sql).
export type HabitValueKind = "checkbox" | "number" | "scale" | "choice";

// Cosmetic color for a choice option (fixed palette; maps to static Tailwind
// classes in the UI). Purely presentational - logs store only the label.
export type ChoiceColor =
  | "green"
  | "red"
  | "amber"
  | "blue"
  | "purple"
  | "cyan"
  | "pink"
  | "gray";

export interface ChoiceOption {
  label: string;
  color: ChoiceColor;
}

// Row in the user_habits table (v2 source of truth for definitions).
export interface UserHabitRow {
  id: string;
  user_id: string;
  habit_key: string;
  name: string;
  emoji: string | null;
  unit: string;
  value_kind: HabitValueKind;
  goal_amount: number | null;
  step: number | null;
  choice_options: ChoiceOption[] | null;
  is_enabled: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at?: string;
  updated_at?: string;
}

// Unified habit the UI renders, regardless of whether it came from the v2
// user_habits table or the legacy hardcoded-definitions + preferences path.
export interface ResolvedHabit {
  key: string;
  name: string;
  unit: string;
  valueKind: HabitValueKind;
  goalAmount: number | null;
  step: number;
  choiceOptions: ChoiceOption[] | null;
  // Custom habits carry an emoji; built-ins carry their legacy key so the UI
  // can map it to the original lucide icon + color.
  emoji: string | null;
  builtinKey: string | null;
  isEnabled: boolean;
  sortOrder: number;
  source: "v2" | "legacy";
}

// Patch applied from the habit editor. In legacy fallback mode only a subset
// is honored (see use-habits.ts).
export interface HabitPatch {
  name?: string;
  emoji?: string | null;
  unit?: string;
  valueKind?: HabitValueKind;
  goalAmount?: number | null;
  step?: number | null;
  choiceOptions?: ChoiceOption[] | null;
  isEnabled?: boolean;
}

export interface NewHabitInput {
  name: string;
  emoji: string | null;
  unit: string;
  valueKind: HabitValueKind;
  goalAmount: number | null;
  step: number | null;
  choiceOptions: ChoiceOption[] | null;
}

// ---------------------------------------------------------------------------
// Legacy types (pre-v2). Still used by the fallback path when the
// add_habits_v2.sql migration has not been applied.
// ---------------------------------------------------------------------------

// Static habit definition (hardcoded built-ins)
export interface HabitDefinition {
  key: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  color: string;
  defaultGoal: number;
  step?: number;
}

// User's preference for a built-in habit (user_habit_preferences table)
export interface HabitPreference {
  id?: string;
  user_id: string;
  habit_key: string;
  is_enabled: boolean;
  tracking_mode: "checkbox" | "goal" | "manual";
  goal_amount: number | null;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

// Daily habit log entry. value_kind/value_text are NULL on rows written
// before v2 (or while the migration is unapplied); interpretation falls back
// to completed/amount via the habit's current kind.
export interface HabitLog {
  id: string;
  user_id: string;
  date: string;
  habit_key: string;
  completed: boolean;
  amount: number | null;
  value_kind?: HabitValueKind | null;
  value_text?: string | null;
  created_at: string;
}

export type HabitLogInsert = Omit<HabitLog, "id" | "created_at">;

// A log interpreted through its kind. `logged: false` means NO DATA (the
// sparse-truth rule): distinct from false/zero and excluded from analytics.
export interface InterpretedLogValue {
  logged: boolean;
  value: boolean | number | string | null;
}
