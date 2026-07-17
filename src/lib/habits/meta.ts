// Icon-free metadata for the built-in habits. This module is imported by
// server code (daily-summary aggregation) and pure-logic tests, so it must
// stay free of lucide-react / client-only imports. The client-side icon and
// color live in config.ts, keyed by the same habit_key.
//
// This list must stay in sync with the seed VALUES in sql/add_habits_v2.sql.

export interface BuiltinHabitMeta {
  key: string;
  name: string;
  unit: string;
  defaultGoal: number;
  step: number;
}

export const BUILTIN_HABIT_META: BuiltinHabitMeta[] = [
  { key: "meditation", name: "Meditation", unit: "min", defaultGoal: 15, step: 5 },
  { key: "reading", name: "Reading", unit: "min", defaultGoal: 30, step: 5 },
  { key: "sauna", name: "Sauna", unit: "min", defaultGoal: 20, step: 5 },
  { key: "thc", name: "THC", unit: "uses", defaultGoal: 1, step: 1 },
  { key: "alcohol", name: "Alcohol", unit: "drinks", defaultGoal: 2, step: 1 },
  { key: "cold_shower", name: "Cold Shower", unit: "min", defaultGoal: 3, step: 1 },
  { key: "nicotine", name: "Nicotine", unit: "uses", defaultGoal: 1, step: 1 },
  { key: "energy_drink", name: "Energy Drink", unit: "drinks", defaultGoal: 1, step: 1 },
  { key: "coffee", name: "Coffee", unit: "cups", defaultGoal: 2, step: 1 },
  { key: "ate_out", name: "Ate Out", unit: "meals", defaultGoal: 1, step: 1 },
  { key: "math_academy", name: "Math Academy", unit: "XP", defaultGoal: 100, step: 10 },
  { key: "anki_review", name: "Anki Review", unit: "cards", defaultGoal: 50, step: 10 },
];

export function getBuiltinMeta(key: string): BuiltinHabitMeta | undefined {
  return BUILTIN_HABIT_META.find((h) => h.key === key);
}
