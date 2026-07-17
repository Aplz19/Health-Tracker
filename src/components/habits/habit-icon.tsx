"use client";

import { getHabitByKey } from "@/lib/habits/config";
import type { ResolvedHabit } from "@/types/habits";

// Built-in habits keep their original lucide icon + color (mapped from the
// legacy habit_key); custom habits render their emoji.
export function HabitIcon({
  habit,
  className = "h-5 w-5",
}: {
  habit: Pick<ResolvedHabit, "emoji" | "builtinKey">;
  className?: string;
}) {
  // A user-set emoji always wins; built-ins without one keep their app icon.
  if (habit.emoji) {
    return (
      <span className="text-lg leading-none" aria-hidden="true">
        {habit.emoji}
      </span>
    );
  }
  if (habit.builtinKey) {
    const definition = getHabitByKey(habit.builtinKey);
    if (definition) {
      const Icon = definition.icon;
      return <Icon className={`${className} ${definition.color}`} />;
    }
  }
  return <span className={`${className} rounded-full bg-muted`} aria-hidden="true" />;
}
