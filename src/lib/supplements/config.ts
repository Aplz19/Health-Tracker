import { Pill, Moon, Coffee, Sun, Leaf, Zap, Fish, Droplets } from "lucide-react";
import type { SupplementDefinition } from "@/types/supplements";

// Daily trackable supplements (user can enable/disable these for daily tracking)
export const SUPPLEMENT_DEFINITIONS: SupplementDefinition[] = [
  {
    key: "creatine",
    table: "creatine_logs",
    label: "Creatine",
    unit: "g",
    icon: Pill,
    color: "text-purple-500",
    defaultGoal: 5,
  },
  {
    key: "fishOil",
    table: "fish_oil_logs",
    label: "Fish Oil",
    unit: "mg",
    icon: Fish,
    color: "text-sky-500",
    defaultGoal: 2000,
  },
  {
    key: "d3",
    table: "d3_logs",
    label: "Vitamin D3",
    unit: "IU",
    icon: Sun,
    color: "text-yellow-500",
    defaultGoal: 5000,
  },
  {
    key: "k2",
    table: "k2_logs",
    label: "Vitamin K2",
    unit: "mcg",
    icon: Leaf,
    color: "text-green-500",
    defaultGoal: 100,
  },
  {
    key: "vitaminC",
    table: "vitamin_c_logs",
    label: "Vitamin C",
    unit: "mg",
    icon: Zap,
    color: "text-orange-500",
    defaultGoal: 1000,
  },
  {
    key: "vitaminA",
    table: "vitamin_a_logs",
    label: "Vitamin A",
    unit: "IU",
    icon: Droplets,
    color: "text-amber-500",
    defaultGoal: 5000,
  },
  {
    key: "vitaminE",
    table: "vitamin_e_logs",
    label: "Vitamin E",
    unit: "IU",
    icon: Pill,
    color: "text-rose-400",
    defaultGoal: 400,
  },
  {
    key: "vitaminB12",
    table: "vitamin_b12_logs",
    label: "Vitamin B12",
    unit: "mcg",
    icon: Zap,
    color: "text-red-500",
    defaultGoal: 1000,
  },
  {
    key: "vitaminBComplex",
    table: "vitamin_b_complex_logs",
    label: "B Complex",
    unit: "mg",
    icon: Pill,
    color: "text-pink-500",
    defaultGoal: 100,
  },
  {
    key: "folate",
    table: "folate_logs",
    label: "Folate",
    unit: "mcg",
    icon: Leaf,
    color: "text-emerald-500",
    defaultGoal: 400,
  },
  {
    key: "biotin",
    table: "biotin_logs",
    label: "Biotin",
    unit: "mcg",
    icon: Pill,
    color: "text-fuchsia-500",
    defaultGoal: 5000,
  },
  {
    key: "zinc",
    table: "zinc_logs",
    label: "Zinc",
    unit: "mg",
    icon: Pill,
    color: "text-slate-400",
    defaultGoal: 15,
  },
  {
    key: "magnesium",
    table: "magnesium_logs",
    label: "Magnesium",
    unit: "mg",
    icon: Pill,
    color: "text-teal-500",
    defaultGoal: 400,
  },
  {
    key: "melatonin",
    table: "melatonin_logs",
    label: "Melatonin",
    unit: "mg",
    icon: Moon,
    color: "text-blue-500",
    defaultGoal: 3,
    step: 0.5,
  },
  {
    key: "caffeine",
    table: "caffeine_logs",
    label: "Caffeine",
    unit: "mg",
    icon: Coffee,
    color: "text-amber-600",
    defaultGoal: 200,
  },
];

// Helper to get a supplement definition by key
export function getSupplementByKey(key: string): SupplementDefinition | undefined {
  return SUPPLEMENT_DEFINITIONS.find((s) => s.key === key);
}

// Helper to get a supplement definition by table name
export function getSupplementByTable(table: string): SupplementDefinition | undefined {
  return SUPPLEMENT_DEFINITIONS.find((s) => s.table === table);
}
