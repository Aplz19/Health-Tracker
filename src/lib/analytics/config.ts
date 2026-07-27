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
  Cookie,
  Salad,
  CircleDot,
  Thermometer,
  Wind,
  Timer,
  TrendingUp,
  Gauge,
  Sparkles,
  Sun,
  Milk,
  Apple,
} from "lucide-react";
import type { MetricDefinition } from "@/types/analytics";
import { SUPPLEMENT_DEFINITIONS } from "@/lib/supplements/config";

// Every tracked supplement gets an analytics metric, derived from its existing
// definition so the two can never drift and new supplements appear here
// automatically. Previously only creatine was wired up, so a supplement like
// Vitamin D3 had nowhere to show its data.
//
// These are deliberately SEPARATE from the same-named nutrition metrics, which
// are sourced from logged food. "Vitamin D" (nutrition) is dietary intake in
// mcg; "Vitamin D3" (supplement) is what you took, in IU. Summing them would be
// wrong by a factor of 40 (1 mcg = 40 IU), so they stay distinct series.
const SUPPLEMENT_METRIC_DEFINITIONS: MetricDefinition[] = SUPPLEMENT_DEFINITIONS.map(
  (supplement) => ({
    key: supplement.key,
    label: supplement.label,
    category: "supplements" as const,
    unit: supplement.unit === "IU" ? " IU" : supplement.unit,
    color: "#a855f7",
    decimals: 0,
    icon: supplement.icon,
  })
);

/** Metric keys that read a supplement `_logs` table rather than food logs. */
export const SUPPLEMENT_METRIC_KEYS = new Set(
  SUPPLEMENT_DEFINITIONS.map((s) => s.key)
);

/** Metric key -> the Supabase table holding that supplement's daily amounts. */
export const SUPPLEMENT_METRIC_TABLES: Record<string, string> = Object.fromEntries(
  SUPPLEMENT_DEFINITIONS.map((s) => [s.key, s.table])
);

const BASE_METRIC_DEFINITIONS: MetricDefinition[] = [
  // ===== NUTRITION - Macros =====
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
    label: "Total Fat",
    category: "nutrition",
    unit: "g",
    color: "#eab308",
    decimals: 0,
    icon: Droplet,
  },
  {
    key: "saturatedFat",
    label: "Saturated Fat",
    category: "nutrition",
    unit: "g",
    color: "#dc2626",
    decimals: 1,
    icon: Droplet,
  },
  {
    key: "transFat",
    label: "Trans Fat",
    category: "nutrition",
    unit: "g",
    color: "#991b1b",
    decimals: 1,
    icon: Droplet,
  },
  {
    key: "polyunsaturatedFat",
    label: "Polyunsaturated Fat",
    category: "nutrition",
    unit: "g",
    color: "#059669",
    decimals: 1,
    icon: Droplet,
  },
  {
    key: "monounsaturatedFat",
    label: "Monounsaturated Fat",
    category: "nutrition",
    unit: "g",
    color: "#10b981",
    decimals: 1,
    icon: Droplet,
  },
  {
    key: "fiber",
    label: "Fiber",
    category: "nutrition",
    unit: "g",
    color: "#84cc16",
    decimals: 0,
    icon: Salad,
  },
  {
    key: "sugar",
    label: "Sugar",
    category: "nutrition",
    unit: "g",
    color: "#f472b6",
    decimals: 0,
    icon: Cookie,
  },
  {
    key: "addedSugar",
    label: "Added Sugar",
    category: "nutrition",
    unit: "g",
    color: "#ec4899",
    decimals: 0,
    icon: Cookie,
  },
  {
    key: "sodium",
    label: "Sodium",
    category: "nutrition",
    unit: "mg",
    color: "#64748b",
    decimals: 0,
    icon: Sparkles,
  },

  // ===== NUTRITION - Micronutrients =====
  {
    key: "vitaminA",
    label: "Vitamin A",
    category: "nutrition",
    unit: "mcg",
    color: "#f59e0b",
    decimals: 0,
    icon: Sun,
  },
  {
    key: "vitaminC",
    label: "Vitamin C",
    category: "nutrition",
    unit: "mg",
    color: "#fb923c",
    decimals: 0,
    icon: Apple,
  },
  {
    key: "vitaminD",
    label: "Vitamin D",
    category: "nutrition",
    unit: "mcg",
    color: "#fbbf24",
    decimals: 0,
    icon: Sun,
  },
  {
    key: "calcium",
    label: "Calcium",
    category: "nutrition",
    unit: "mg",
    color: "#e2e8f0",
    decimals: 0,
    icon: Milk,
  },
  {
    key: "iron",
    label: "Iron",
    category: "nutrition",
    unit: "mg",
    color: "#78716c",
    decimals: 1,
    icon: CircleDot,
  },

  // ===== WHOOP =====
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
  {
    key: "spo2",
    label: "SpO2",
    category: "whoop",
    unit: "%",
    color: "#06b6d4",
    decimals: 1,
    icon: Wind,
  },
  {
    key: "skinTemp",
    label: "Skin Temp",
    category: "whoop",
    unit: "°C",
    color: "#f43f5e",
    decimals: 1,
    icon: Thermometer,
  },
  {
    key: "kilojoules",
    label: "Calories Burned",
    category: "whoop",
    unit: "kJ",
    color: "#fb7185",
    decimals: 0,
    icon: Flame,
  },
  {
    key: "avgHeartRate",
    label: "Avg Heart Rate",
    category: "whoop",
    unit: "bpm",
    color: "#e11d48",
    decimals: 0,
    icon: Heart,
  },
  {
    key: "maxHeartRate",
    label: "Max Heart Rate",
    category: "whoop",
    unit: "bpm",
    color: "#be123c",
    decimals: 0,
    icon: TrendingUp,
  },

  // ===== EXERCISE =====
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
  {
    key: "sets",
    label: "Total Sets",
    category: "exercise",
    unit: "",
    color: "#8b5cf6",
    decimals: 0,
    icon: Gauge,
  },
  {
    key: "cardioSessions",
    label: "Cardio Sessions",
    category: "exercise",
    unit: "",
    color: "#f97316",
    decimals: 0,
    icon: Activity,
  },
  {
    key: "cardioMinutes",
    label: "Cardio Duration",
    category: "exercise",
    unit: "min",
    color: "#0ea5e9",
    decimals: 0,
    icon: Timer,
  },

  // ===== SUPPLEMENTS =====
  // Generated from SUPPLEMENT_DEFINITIONS below (this used to hardcode only
  // creatine, which is why no other supplement could be charted).
];

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  ...BASE_METRIC_DEFINITIONS,
  ...SUPPLEMENT_METRIC_DEFINITIONS,
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
