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
