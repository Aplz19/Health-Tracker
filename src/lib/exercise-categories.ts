import type { ExerciseCategory } from "@/lib/supabase/types";

/**
 * Display order for exercise categories
 */
export const CATEGORY_ORDER: ExerciseCategory[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "calves",
  "forearms",
  "abs",
];

/**
 * Human-readable labels for each category
 */
export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  forearms: "Forearms",
  abs: "Abs",
};

/**
 * Category options for form selects
 */
export const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] =
  CATEGORY_ORDER.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
  }));
