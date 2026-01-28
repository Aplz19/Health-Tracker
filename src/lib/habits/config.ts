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
} from "lucide-react";
import type { HabitDefinition } from "@/types/habits";

export const HABIT_DEFINITIONS: HabitDefinition[] = [
  {
    key: "meditation",
    label: "Meditation",
    unit: "min",
    icon: Brain,
    color: "text-purple-500",
    defaultGoal: 15,
    step: 5,
  },
  {
    key: "reading",
    label: "Reading",
    unit: "min",
    icon: BookOpen,
    color: "text-blue-500",
    defaultGoal: 30,
    step: 5,
  },
  {
    key: "sauna",
    label: "Sauna",
    unit: "min",
    icon: Flame,
    color: "text-orange-500",
    defaultGoal: 20,
    step: 5,
  },
  {
    key: "thc",
    label: "THC",
    unit: "uses",
    icon: Cannabis,
    color: "text-green-500",
    defaultGoal: 1,
    step: 1,
  },
  {
    key: "alcohol",
    label: "Alcohol",
    unit: "drinks",
    icon: Wine,
    color: "text-red-500",
    defaultGoal: 2,
    step: 1,
  },
  {
    key: "cold_shower",
    label: "Cold Shower",
    unit: "min",
    icon: Snowflake,
    color: "text-cyan-500",
    defaultGoal: 3,
    step: 1,
  },
  {
    key: "nicotine",
    label: "Nicotine",
    unit: "uses",
    icon: Cigarette,
    color: "text-gray-500",
    defaultGoal: 1,
    step: 1,
  },
  {
    key: "energy_drink",
    label: "Energy Drink",
    unit: "drinks",
    icon: Zap,
    color: "text-yellow-500",
    defaultGoal: 1,
    step: 1,
  },
  {
    key: "coffee",
    label: "Coffee",
    unit: "cups",
    icon: Coffee,
    color: "text-amber-700",
    defaultGoal: 2,
    step: 1,
  },
  {
    key: "ate_out",
    label: "Ate Out",
    unit: "meals",
    icon: UtensilsCrossed,
    color: "text-rose-500",
    defaultGoal: 1,
    step: 1,
  },
  {
    key: "math_academy",
    label: "Math Academy",
    unit: "XP",
    icon: Calculator,
    color: "text-indigo-500",
    defaultGoal: 100,
    step: 10,
  },
  {
    key: "anki_review",
    label: "Anki Review",
    unit: "cards",
    icon: Layers,
    color: "text-sky-500",
    defaultGoal: 50,
    step: 10,
  },
];

export function getHabitByKey(key: string): HabitDefinition | undefined {
  return HABIT_DEFINITIONS.find((h) => h.key === key);
}

export function getAllHabitKeys(): string[] {
  return HABIT_DEFINITIONS.map((h) => h.key);
}
