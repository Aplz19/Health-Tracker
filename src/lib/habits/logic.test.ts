import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoCreatesPlaceholder,
  clampScale,
  enabledSorted,
  generateHabitKey,
  interpretLog,
  isMissingSchemaError,
  resolveFromLegacy,
  resolveFromV2,
  validateChoiceOptions,
} from "./logic";
import { BUILTIN_HABIT_META } from "./meta";
import type { HabitLog, HabitPreference, UserHabitRow } from "@/types/habits";

function makeLog(partial: Partial<HabitLog>): HabitLog {
  return {
    id: "log-1",
    user_id: "user-1",
    date: "2026-07-16",
    habit_key: "meditation",
    completed: false,
    amount: null,
    created_at: "2026-07-16T00:00:00Z",
    ...partial,
  };
}

function makeV2Row(partial: Partial<UserHabitRow>): UserHabitRow {
  return {
    id: "habit-1",
    user_id: "user-1",
    habit_key: "custom_test_abc123",
    name: "Test",
    emoji: "🔥",
    unit: "",
    value_kind: "checkbox",
    goal_amount: null,
    step: null,
    choice_options: null,
    is_enabled: true,
    sort_order: 0,
    archived_at: null,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// isMissingSchemaError - the graceful-fallback trigger
// ---------------------------------------------------------------------------

test("isMissingSchemaError detects undefined table / schema-cache errors", () => {
  assert.equal(isMissingSchemaError({ code: "42P01" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST205" }), true);
  assert.equal(isMissingSchemaError({ code: "PGRST204" }), true);
  assert.equal(
    isMissingSchemaError({ message: 'relation "user_habits" does not exist' }),
    true
  );
  assert.equal(
    isMissingSchemaError({
      message: "Could not find the table 'public.user_habits' in the schema cache",
    }),
    true
  );
});

test("isMissingSchemaError is not fooled by other errors", () => {
  assert.equal(isMissingSchemaError(null), false);
  assert.equal(isMissingSchemaError(undefined), false);
  assert.equal(isMissingSchemaError({ code: "PGRST116" }), false); // no rows
  assert.equal(isMissingSchemaError({ message: "JWT expired" }), false);
  assert.equal(isMissingSchemaError({ code: "23505", message: "duplicate key" }), false);
});

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

test("resolveFromV2 maps rows, marks built-ins, and drops archived habits", () => {
  const rows: UserHabitRow[] = [
    makeV2Row({
      habit_key: "meditation",
      name: "Meditation",
      emoji: null,
      unit: "min",
      value_kind: "number",
      goal_amount: 20,
      step: 5,
      sort_order: 1,
    }),
    makeV2Row({
      habit_key: "custom_day_type_a1b2c3",
      name: "Day Type",
      emoji: "🚦",
      value_kind: "choice",
      choice_options: ["green", "red", "life"],
      sort_order: 0,
    }),
    makeV2Row({ habit_key: "custom_old_x", archived_at: "2026-07-01T00:00:00Z" }),
  ];

  const resolved = resolveFromV2(rows);
  assert.equal(resolved.length, 2); // archived dropped
  const meditation = resolved.find((h) => h.key === "meditation");
  const dayType = resolved.find((h) => h.key === "custom_day_type_a1b2c3");
  assert.equal(meditation?.builtinKey, "meditation"); // keeps lucide icon
  assert.equal(meditation?.source, "v2");
  assert.equal(dayType?.builtinKey, null); // custom -> emoji
  assert.deepEqual(dayType?.choiceOptions, ["green", "red", "life"]);
});

test("resolveFromLegacy maps tracking modes and keeps user goals", () => {
  const prefs: HabitPreference[] = [
    {
      user_id: "user-1",
      habit_key: "meditation",
      is_enabled: true,
      tracking_mode: "goal",
      goal_amount: 20,
      sort_order: 0,
    },
    {
      user_id: "user-1",
      habit_key: "coffee",
      is_enabled: true,
      tracking_mode: "checkbox",
      goal_amount: 2,
      sort_order: 1,
    },
  ];

  const resolved = resolveFromLegacy(prefs);
  assert.equal(resolved.length, BUILTIN_HABIT_META.length); // full catalog
  const meditation = resolved.find((h) => h.key === "meditation");
  const coffee = resolved.find((h) => h.key === "coffee");
  const sauna = resolved.find((h) => h.key === "sauna"); // no pref row

  assert.equal(meditation?.valueKind, "number"); // goal -> number
  assert.equal(meditation?.goalAmount, 20); // user's goal preserved
  assert.equal(coffee?.valueKind, "checkbox");
  assert.equal(coffee?.goalAmount, null); // checkboxes carry no amount
  assert.equal(sauna?.isEnabled, false);
  assert.equal(resolved.every((h) => h.source === "legacy"), true);
});

test("enabledSorted filters and orders", () => {
  const habits = resolveFromLegacy([
    { user_id: "u", habit_key: "coffee", is_enabled: true, tracking_mode: "checkbox", goal_amount: null, sort_order: 2 },
    { user_id: "u", habit_key: "sauna", is_enabled: true, tracking_mode: "checkbox", goal_amount: null, sort_order: 1 },
  ]);
  const enabled = enabledSorted(habits);
  assert.deepEqual(enabled.map((h) => h.key), ["sauna", "coffee"]);
});

// ---------------------------------------------------------------------------
// interpretLog - sparse truth
// ---------------------------------------------------------------------------

test("absent rows are NA for every kind", () => {
  for (const kind of ["checkbox", "number", "scale", "choice"] as const) {
    assert.deepEqual(interpretLog(kind, undefined), { logged: false, value: null });
  }
});

test("checkbox: an existing row is an explicit yes/no", () => {
  assert.deepEqual(
    interpretLog("checkbox", makeLog({ completed: true, value_kind: "checkbox" })),
    { logged: true, value: true }
  );
  assert.deepEqual(
    interpretLog("checkbox", makeLog({ completed: false, value_kind: "checkbox" })),
    { logged: true, value: false }
  );
});

test("number: placeholder rows (amount null) are NOT logged data", () => {
  // Auto-created placeholder from viewing the tab - must stay NA
  assert.deepEqual(
    interpretLog("number", makeLog({ completed: false, amount: null })),
    { logged: false, value: null }
  );
  assert.deepEqual(
    interpretLog("number", makeLog({ completed: true, amount: 80, value_kind: "number" })),
    { logged: true, value: 80 }
  );
});

test("scale: never defaults - absent or null amount is NA, value passes through", () => {
  assert.deepEqual(
    interpretLog("scale", makeLog({ amount: null, value_kind: "scale" })),
    { logged: false, value: null }
  );
  assert.deepEqual(
    interpretLog("scale", makeLog({ completed: true, amount: 4, value_kind: "scale" })),
    { logged: true, value: 4 }
  );
});

test("choice: value_text carries the option", () => {
  assert.deepEqual(
    interpretLog("choice", makeLog({ completed: true, value_text: "green", value_kind: "choice" })),
    { logged: true, value: "green" }
  );
  assert.deepEqual(
    interpretLog("choice", makeLog({ value_text: null, value_kind: "choice" })),
    { logged: false, value: null }
  );
});

test("kind snapshot wins over the habit's current kind (type-change safety)", () => {
  // Habit is now a scale, but this old row was recorded as a checkbox:
  // it must still read as a checkbox yes, not as a scale value.
  const oldRow = makeLog({ completed: true, amount: null, value_kind: "checkbox" });
  assert.deepEqual(interpretLog("scale", oldRow), { logged: true, value: true });
});

test("legacy rows (no snapshot) interpret via the habit's current kind", () => {
  const legacyRow = makeLog({ completed: true, amount: 30, value_kind: null });
  assert.deepEqual(interpretLog("number", legacyRow), { logged: true, value: 30 });
});

// ---------------------------------------------------------------------------
// Placeholder policy + validation + keys
// ---------------------------------------------------------------------------

test("placeholders auto-create only for checkbox/number", () => {
  assert.equal(autoCreatesPlaceholder("checkbox"), true);
  assert.equal(autoCreatesPlaceholder("number"), true);
  assert.equal(autoCreatesPlaceholder("scale"), false);
  assert.equal(autoCreatesPlaceholder("choice"), false);
});

test("validateChoiceOptions cleans, dedupes, and enforces a minimum", () => {
  assert.deepEqual(validateChoiceOptions([" green ", "red", "life"]), {
    options: ["green", "red", "life"],
    error: null,
  });
  assert.notEqual(validateChoiceOptions(["green", "GREEN"]).error, null);
  assert.notEqual(validateChoiceOptions(["only-one"]).error, null);
  assert.notEqual(validateChoiceOptions(["", "  "]).error, null);
});

test("clampScale keeps values in 1-5", () => {
  assert.equal(clampScale(0), 1);
  assert.equal(clampScale(3), 3);
  assert.equal(clampScale(9), 5);
  assert.equal(clampScale(3.6), 4);
});

test("generateHabitKey produces distinct, slugged keys", () => {
  const a = generateHabitKey("Arrival Energy!");
  const b = generateHabitKey("Arrival Energy!");
  assert.match(a, /^custom_arrival_energy_[0-9a-f]{6}$/);
  assert.notEqual(a, b);
  assert.match(generateHabitKey("!!!"), /^custom_habit_[0-9a-f]{6}$/);
});
