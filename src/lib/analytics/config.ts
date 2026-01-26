import {
  Flame,
  Beef,
  Wheat,
  Droplet,
  Heart,
  Activity,
  Moon,
  Zap,
  Dumbbell,
  Weight,
  Pill,
} from "lucide-react";
import type { MetricDefinition } from "@/types/analytics";

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // Nutrition metrics
  {
    key: "calories",
    label: "Calories",
    category: "nutrition",
    unit: " cal",
    color: "#f97316",
    decimals: 0,
    icon: Flame,
  },
  {
    key: "protein",
    label: "Protein",
    category: "nutrition",
    unit: "g",
    color: "#3b82f6",
    decimals: 0,
    icon: Beef,
  },
  {
    key: "carbs",
    label: "Carbs",
    category: "nutrition",
    unit: "g",
    color: "#22c55e",
    decimals: 0,
    icon: Wheat,
  },
  {
    key: "fat",
    label: "Fat",
    category: "nutrition",
    unit: "g",
    color: "#eab308",
    decimals: 0,
    icon: Droplet,
  },

  // Whoop metrics
  {
    key: "recovery",
    label: "Recovery",
    category: "whoop",
    unit: "%",
    color: "#22c55e",
    decimals: 0,
    icon: Heart,
  },
  {
    key: "hrv",
    label: "HRV",
    category: "whoop",
    unit: "ms",
    color: "#8b5cf6",
    decimals: 1,
    icon: Activity,
  },
  {
    key: "rhr",
    label: "Resting HR",
    category: "whoop",
    unit: "bpm",
    color: "#ef4444",
    decimals: 0,
    icon: Heart,
  },
  {
    key: "strain",
    label: "Strain",
    category: "whoop",
    unit: "",
    color: "#f97316",
    decimals: 1,
    icon: Zap,
  },
  {
    key: "sleepScore",
    label: "Sleep Score",
    category: "whoop",
    unit: "%",
    color: "#6366f1",
    decimals: 0,
    icon: Moon,
  },
  {
    key: "sleepDuration",
    label: "Sleep Duration",
    category: "whoop",
    unit: "hrs",
    color: "#0ea5e9",
    decimals: 1,
    icon: Moon,
  },

  // Exercise metrics
  {
    key: "workouts",
    label: "Workouts",
    category: "exercise",
    unit: "",
    color: "#ec4899",
    decimals: 0,
    icon: Dumbbell,
  },
  {
    key: "volume",
    label: "Volume",
    category: "exercise",
    unit: "lbs",
    color: "#14b8a6",
    decimals: 0,
    icon: Weight,
  },

  // Supplements
  {
    key: "creatine",
    label: "Creatine",
    category: "supplements",
    unit: "g",
    color: "#a855f7",
    decimals: 0,
    icon: Pill,
  },
];

export function getMetricByKey(key: string): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find((m) => m.key === key);
}

export function getMetricsByCategory(category: string): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter((m) => m.category === category);
}

export function getAllMetricKeys(): string[] {
  return METRIC_DEFINITIONS.map((m) => m.key);
}

// Default enabled metrics for new users
export const DEFAULT_ENABLED_METRICS = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "recovery",
  "hrv",
  "sleepScore",
  "strain",
  "workouts",
  "volume",
];
