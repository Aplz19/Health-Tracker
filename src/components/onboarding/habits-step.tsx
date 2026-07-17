"use client";

import { ListChecks, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HabitsStepProps {
  onNext: () => void;
  onSkip: () => void;
  isLastStep?: boolean;
}

export function HabitsStep({ onNext, isLastStep }: HabitsStepProps) {
  // Placeholder habits for display
  const placeholderHabits = [
    { name: "Morning Workout", icon: "💪" },
    { name: "Read 30 mins", icon: "📚" },
    { name: "Meditate", icon: "🧘" },
    { name: "No Alcohol", icon: "🚫" },
    { name: "8 Hours Sleep", icon: "😴" },
    { name: "Drink Water", icon: "💧" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
          <ListChecks className="w-8 h-8 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold">Track Your Habits</h1>
        <p className="text-muted-foreground">
          Build better routines by tracking daily habits.
        </p>
      </div>

      {/* Feature intro */}
      <div className="bg-muted/50 rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Sparkles className="w-5 h-5" />
          <span className="font-medium">Make it yours</span>
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Create your own habits in Settings &gt; Habits - checkboxes, amounts
          with goals, 1-5 ratings, or pick-one choices. For example:
        </p>

        {/* Preview habits grid */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {placeholderHabits.map((habit) => (
            <div
              key={habit.name}
              className="flex items-center gap-2 p-3 rounded-lg border border-dashed bg-background/50"
            >
              <span className="text-lg">{habit.icon}</span>
              <span className="text-sm text-muted-foreground">{habit.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Finish button */}
      <div className="flex justify-center pt-4">
        <Button size="lg" onClick={onNext} className="gap-2 px-8">
          {isLastStep ? (
            <>
              <Sparkles className="w-4 h-4" />
              Get Started
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
