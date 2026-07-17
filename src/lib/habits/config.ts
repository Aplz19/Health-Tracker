import {
  Brain,
  BookOpen,
  Flame,
  Cannabis,
  Wine,
  Snowflake,
  Cigarette,
  Zap,
  Coffee,
  UtensilsCrossed,
  Calculator,
  Layers,
  type LucideIcon,
} from "lucide-react";
import type { HabitDefinition } from "@/types/habits";
import { BUILTIN_HABIT_META } from "./meta";

// Client-side presentation for the built-in habits. The data (name, unit,
// goals) lives icon-free in meta.ts so server code can use it; this module
// adds the lucide icon + color and preserves the legacy HABIT_DEFINITIONS
// shape used by the pre-v2 fallback path.

const BUILTIN_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  meditation: { icon: Brain, color: "text-purple-500" },
  reading: { icon: BookOpen, color: "text-blue-500" },
  sauna: { icon: Flame, color: "text-orange-500" },
  thc: { icon: Cannabis, color: "text-green-500" },
  alcohol: { icon: Wine, color: "text-red-500" },
  cold_shower: { icon: Snowflake, color: "text-cyan-500" },
  nicotine: { icon: Cigarette, color: "text-gray-500" },
  energy_drink: { icon: Zap, color: "text-yellow-500" },
  coffee: { icon: Coffee, color: "text-amber-700" },
  ate_out: { icon: UtensilsCrossed, color: "text-rose-500" },
  math_academy: { icon: Calculator, color: "text-indigo-500" },
  anki_review: { icon: Layers, color: "text-sky-500" },
};

export const HABIT_DEFINITIONS: HabitDefinition[] = BUILTIN_HABIT_META.map(
  (meta) => ({
    key: meta.key,
    label: meta.name,
    unit: meta.unit,
    icon: BUILTIN_ICONS[meta.key]?.icon ?? Brain,
    color: BUILTIN_ICONS[meta.key]?.color ?? "text-muted-foreground",
    defaultGoal: meta.defaultGoal,
    step: meta.step,
  })
);

export function getHabitByKey(key: string): HabitDefinition | undefined {
  return HABIT_DEFINITIONS.find((h) => h.key === key);
}

export function getAllHabitKeys(): string[] {
  return HABIT_DEFINITIONS.map((h) => h.key);
}
