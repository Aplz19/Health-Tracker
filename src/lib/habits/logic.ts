// Pure habits-v2 logic: no supabase, no react, no icons. Everything here is
// shared by the client hooks, the server daily-summary aggregation, and the
// unit tests (logic.test.ts).

import type {
  ChoiceColor,
  ChoiceOption,
  HabitLog,
  HabitPreference,
  HabitValueKind,
  InterpretedLogValue,
  ResolvedHabit,
  UserHabitRow,
} from "@/types/habits";
import { BUILTIN_HABIT_META } from "./meta";

// ---------------------------------------------------------------------------
// Choice option colors (cosmetic). Fixed palette; assignment order gives new
// options distinct colors without the user having to pick.
// ---------------------------------------------------------------------------

export const CHOICE_COLORS: ChoiceColor[] = [
  "green",
  "red",
  "amber",
  "blue",
  "purple",
  "cyan",
  "pink",
  "gray",
];

function isChoiceColor(value: unknown): value is ChoiceColor {
  return typeof value === "string" && (CHOICE_COLORS as string[]).includes(value);
}

// choice_options is JSONB and has carried two shapes: plain strings (first
// v2 release) and {label, color} objects. Normalize anything the DB hands us;
// legacy strings get palette colors assigned by position.
export function normalizeChoiceOptions(raw: unknown): ChoiceOption[] | null {
  if (!Array.isArray(raw)) return null;
  const options: ChoiceOption[] = [];
  for (const entry of raw) {
    if (typeof entry === "string") {
      options.push({
        label: entry,
        color: CHOICE_COLORS[options.length % CHOICE_COLORS.length],
      });
    } else if (
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as { label?: unknown }).label === "string"
    ) {
      const color = (entry as { color?: unknown }).color;
      options.push({
        label: (entry as { label: string }).label,
        color: isChoiceColor(color)
          ? color
          : CHOICE_COLORS[options.length % CHOICE_COLORS.length],
      });
    }
    // Anything else (numbers, malformed objects) is dropped.
  }
  return options.length > 0 ? options : null;
}

// First palette color not already used by the given options (wraps around).
export function nextChoiceColor(existing: ChoiceOption[]): ChoiceColor {
  const used = new Set(existing.map((o) => o.color));
  return (
    CHOICE_COLORS.find((c) => !used.has(c)) ??
    CHOICE_COLORS[existing.length % CHOICE_COLORS.length]
  );
}

export function cycleChoiceColor(current: ChoiceColor): ChoiceColor {
  const index = CHOICE_COLORS.indexOf(current);
  return CHOICE_COLORS[(index + 1) % CHOICE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Schema-capability detection (graceful fallback while the migration is
// unapplied). Postgres 42P01 = undefined_table; PostgREST PGRST205 = table
// missing from the schema cache; PGRST204 = column missing from the cache.
// ---------------------------------------------------------------------------

export function isMissingSchemaError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204") {
    return true;
  }
  const message = error.message ?? "";
  return /does not exist|schema cache|could not find/i.test(message);
}

// ---------------------------------------------------------------------------
// Resolution: v2 rows / legacy preferences -> the unified ResolvedHabit shape
// ---------------------------------------------------------------------------

const BUILTIN_KEYS = new Set(BUILTIN_HABIT_META.map((m) => m.key));

export function resolveFromV2(rows: UserHabitRow[]): ResolvedHabit[] {
  return rows
    .filter((row) => !row.archived_at)
    .map((row) => ({
      key: row.habit_key,
      name: row.name,
      unit: row.unit ?? "",
      valueKind: row.value_kind,
      goalAmount: row.goal_amount,
      step: row.step ?? 1,
      // Defense in depth: rows may arrive raw from the DB (legacy string
      // arrays or malformed entries) - always normalize.
      choiceOptions: normalizeChoiceOptions(row.choice_options),
      emoji: row.emoji,
      builtinKey: BUILTIN_KEYS.has(row.habit_key) ? row.habit_key : null,
      isEnabled: row.is_enabled,
      sortOrder: row.sort_order,
      source: "v2" as const,
    }));
}

// Legacy mapping: checkbox -> checkbox; goal/manual -> number (goal mode's
// one-tap behavior comes back automatically because number-with-goal renders
// the quick-complete checkbox).
export function resolveFromLegacy(prefs: HabitPreference[]): ResolvedHabit[] {
  return BUILTIN_HABIT_META.map((meta) => {
    const pref = prefs.find((p) => p.habit_key === meta.key);
    const mode = pref?.tracking_mode ?? "checkbox";
    const valueKind: HabitValueKind = mode === "checkbox" ? "checkbox" : "number";
    return {
      key: meta.key,
      name: meta.name,
      unit: meta.unit,
      valueKind,
      goalAmount:
        valueKind === "checkbox" ? null : pref?.goal_amount ?? meta.defaultGoal,
      step: meta.step,
      choiceOptions: null,
      emoji: null,
      builtinKey: meta.key,
      isEnabled: pref?.is_enabled ?? false,
      sortOrder: pref?.sort_order ?? 999,
      source: "legacy" as const,
    };
  });
}

export function enabledSorted(habits: ResolvedHabit[]): ResolvedHabit[] {
  return habits
    .filter((h) => h.isEnabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ---------------------------------------------------------------------------
// Log interpretation (the sparse-truth rule lives here)
// ---------------------------------------------------------------------------
//
// `logged: false` means NO DATA for the day - it is never conflated with
// false / 0 / a default option. Scale and choice habits are never
// auto-created, so an absent row is a genuine NA. Checkbox/number habits may
// have auto-created placeholder rows (completed=false, amount=null) from the
// tab being viewed; those interpret as logged=false for number (no amount was
// entered) and as an explicit "no" for checkbox, matching pre-v2 behavior.

export function interpretLog(
  kind: HabitValueKind,
  log: HabitLog | undefined
): InterpretedLogValue {
  if (!log) return { logged: false, value: null };
  // A log row recorded under a different kind is still shown through the kind
  // it was recorded as (the snapshot); fall back to the habit's current kind
  // for legacy rows with no snapshot.
  const recordedKind = log.value_kind ?? kind;
  switch (recordedKind) {
    case "checkbox":
      return { logged: true, value: log.completed };
    case "number":
      return log.amount === null || log.amount === undefined
        ? { logged: false, value: null }
        : { logged: true, value: log.amount };
    case "scale":
      return log.amount === null || log.amount === undefined
        ? { logged: false, value: null }
        : { logged: true, value: log.amount };
    case "choice":
      return log.value_text === null || log.value_text === undefined
        ? { logged: false, value: null }
        : { logged: true, value: log.value_text };
  }
}

// Kinds that get placeholder rows auto-created when the tab is viewed
// (pre-v2 behavior, preserved). Scale/choice are NEVER auto-created.
export function autoCreatesPlaceholder(kind: HabitValueKind): boolean {
  return kind === "checkbox" || kind === "number";
}

// ---------------------------------------------------------------------------
// Validation + key generation
// ---------------------------------------------------------------------------

export function validateChoiceOptions(raw: ChoiceOption[]): {
  options: ChoiceOption[] | null;
  error: string | null;
} {
  const cleaned = raw
    .map((o) => ({ ...o, label: o.label.trim() }))
    .filter((o) => o.label.length > 0);
  const seen = new Set<string>();
  for (const option of cleaned) {
    const lower = option.label.toLowerCase();
    if (seen.has(lower)) {
      return { options: null, error: `Duplicate option: "${option.label}"` };
    }
    seen.add(lower);
  }
  if (cleaned.length < 2) {
    return { options: null, error: "A choice habit needs at least 2 options" };
  }
  return { options: cleaned, error: null };
}

export function clampScale(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

// custom_<slug>_<random> - stable, readable, collision-safe (unique index on
// (user_id, habit_key) is the real guarantee).
export function generateHabitKey(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const random = Math.random().toString(16).slice(2, 8);
  return `custom_${slug || "habit"}_${random}`;
}

// ---------------------------------------------------------------------------
// Occurrence counting (analytics habit dashboard)
// ---------------------------------------------------------------------------

/**
 * Labels a two-option choice uses to mean yes / no.
 *
 * A habit like "Coffee" with options Yes/No is semantically a checkbox that
 * happens to be stored as a choice. Counting every answered day would report
 * "7 of 7" for a week of answering No, which is the opposite of what the
 * question asks.
 */
const AFFIRMATIVE_LABELS = new Set(["yes", "y", "true", "done", "completed", "complete"]);
const NEGATIVE_LABELS = new Set(["no", "n", "false", "none", "skip", "skipped", "never"]);

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Option labels for a habit, tolerating both the object and bare-string shapes. */
export function choiceLabels(habit: Pick<ResolvedHabit, "choiceOptions">): string[] {
  return (habit.choiceOptions ?? []).map((option) =>
    typeof option === "string" ? option : option.label
  );
}

/**
 * True when a choice habit is really a yes/no question: exactly two options,
 * one affirmative and one negative. Anything else (day type green/red/life) has
 * no single "did it happen" reading.
 */
export function isBooleanChoice(habit: Pick<ResolvedHabit, "choiceOptions">): boolean {
  const labels = choiceLabels(habit).map(normalizeLabel);
  if (labels.length !== 2) return false;
  return (
    (AFFIRMATIVE_LABELS.has(labels[0]) && NEGATIVE_LABELS.has(labels[1])) ||
    (NEGATIVE_LABELS.has(labels[0]) && AFFIRMATIVE_LABELS.has(labels[1]))
  );
}

/**
 * Which kind a stored row should be read as.
 *
 * `value_kind` is the snapshot taken when the row was written, and is
 * authoritative. Rows predating the snapshot have it null, and falling back to
 * the habit's CURRENT kind silently discards them: a legacy checkbox row on a
 * habit that is now a choice has no `value_text`, so it reads as unlogged.
 * Infer from what the row actually holds instead.
 */
export function recordedKindOf(
  habit: Pick<ResolvedHabit, "valueKind">,
  log: HabitLog
): HabitValueKind {
  if (log.value_kind) return log.value_kind;
  if (log.value_text !== null && log.value_text !== undefined) return "choice";
  if (log.amount !== null && log.amount !== undefined) return "number";
  if (log.completed !== null && log.completed !== undefined) return "checkbox";
  return habit.valueKind;
}

/**
 * Did the habit actually HAPPEN on this row? `null` means nothing was logged,
 * which is never the same as a no (sparse truth).
 *
 * Note `completed` is set true on choice rows merely to mark them answered, so
 * it must not be consulted for a choice row -- doing so counts every answered
 * day, including the ones answered No.
 */
export function isHabitOccurrence(
  habit: Pick<ResolvedHabit, "valueKind" | "choiceOptions">,
  log: HabitLog | undefined
): boolean | null {
  if (!log) return null;

  switch (recordedKindOf(habit, log)) {
    case "checkbox":
      return log.completed === true ? true : log.completed === false ? false : null;

    case "choice": {
      const text = log.value_text;
      if (text === null || text === undefined || text === "") return null;
      // Only a yes/no choice has a defensible occurrence reading; for a
      // multi-option choice any recorded answer counts as a day it was logged.
      if (!isBooleanChoice(habit)) return true;
      const normalized = normalizeLabel(text);
      if (AFFIRMATIVE_LABELS.has(normalized)) return true;
      if (NEGATIVE_LABELS.has(normalized)) return false;
      return true;
    }

    case "number":
      if (log.amount === null || log.amount === undefined) return null;
      return log.amount > 0;

    case "scale":
      if (log.amount === null || log.amount === undefined) return null;
      return true;
  }
}
