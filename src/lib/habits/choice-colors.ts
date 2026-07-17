import type { ChoiceColor } from "@/types/habits";

// Static Tailwind class literals for choice-option colors (Tailwind's JIT
// only sees full literal strings, so these can never be built dynamically).
// `chip` styles the selected state of an option in the Habits tab;
// `dot` is the little color swatch in the editor.
export const CHOICE_COLOR_CLASSES: Record<
  ChoiceColor,
  { chip: string; dot: string }
> = {
  green: {
    chip: "border-green-500 bg-green-500/20 text-green-400",
    dot: "bg-green-500",
  },
  red: {
    chip: "border-red-500 bg-red-500/20 text-red-400",
    dot: "bg-red-500",
  },
  amber: {
    chip: "border-amber-500 bg-amber-500/20 text-amber-400",
    dot: "bg-amber-500",
  },
  blue: {
    chip: "border-blue-500 bg-blue-500/20 text-blue-400",
    dot: "bg-blue-500",
  },
  purple: {
    chip: "border-purple-500 bg-purple-500/20 text-purple-400",
    dot: "bg-purple-500",
  },
  cyan: {
    chip: "border-cyan-500 bg-cyan-500/20 text-cyan-400",
    dot: "bg-cyan-500",
  },
  pink: {
    chip: "border-pink-500 bg-pink-500/20 text-pink-400",
    dot: "bg-pink-500",
  },
  gray: {
    chip: "border-gray-400 bg-gray-400/20 text-gray-300",
    dot: "bg-gray-400",
  },
};
