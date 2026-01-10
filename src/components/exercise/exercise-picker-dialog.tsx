"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useExercises } from "@/hooks/use-exercises";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/exercise-categories";
import type { Exercise, ExerciseCategory } from "@/lib/supabase/types";

interface ExercisePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectExercise: (exerciseId: string) => Promise<unknown>;
}

export function ExercisePickerDialog({
  open,
  onOpenChange,
  onSelectExercise,
}: ExercisePickerDialogProps) {
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | null>(null);
  const { exercises, isLoading } = useExercises();

  // Count exercises per category
  const exerciseCountByCategory = CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = exercises.filter((ex) => ex.category === category).length;
    return acc;
  }, {} as Record<ExerciseCategory, number>);

  // Get exercises for selected category
  const categoryExercises = selectedCategory
    ? exercises.filter((ex) => ex.category === selectedCategory)
    : [];

  const handleSelect = async (exercise: Exercise) => {
    try {
      await onSelectExercise(exercise.id);
      handleClose();
    } catch {
      // Error handled by hook
    }
  };

  const handleClose = () => {
    setSelectedCategory(null);
    onOpenChange(false);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b">
          {selectedCategory ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleBack}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <DialogTitle>{CATEGORY_LABELS[selectedCategory]}</DialogTitle>
            </div>
          ) : (
            <DialogTitle>Select Category</DialogTitle>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Loading...
            </p>
          )}

          {/* Categories View */}
          {!isLoading && !selectedCategory && (
            <div className="p-4 space-y-2">
              {CATEGORY_ORDER.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className="w-full flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                    <span className="text-sm text-muted-foreground">
                      ({exerciseCountByCategory[category]})
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* Exercises View */}
          {!isLoading && selectedCategory && (
            <div className="p-4">
              {categoryExercises.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No exercises in this category yet.
                  <br />
                  Add some in the Exercise Library!
                </p>
              ) : (
                <div className="space-y-2">
                  {categoryExercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      onClick={() => handleSelect(exercise)}
                      className="w-full text-left p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <span className="font-medium">{exercise.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
