"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Search, Dumbbell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [searchQuery, setSearchQuery] = useState("");
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

  // Search across all exercises
  const searchResults = searchQuery.trim()
    ? exercises.filter((ex) =>
        ex.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
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
    setSearchQuery("");
    onOpenChange(false);
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-[95vw] max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b flex-shrink-0">
          {selectedCategory ? (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -ml-1"
                onClick={handleBack}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <DialogTitle>{CATEGORY_LABELS[selectedCategory]}</DialogTitle>
            </div>
          ) : (
            <DialogTitle className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5" />
              Select Exercise
            </DialogTitle>
          )}
        </DialogHeader>

        {/* Search bar - only show on main screen */}
        {!selectedCategory && (
          <div className="px-4 py-3 border-b flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search all exercises..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-10"
              />
            </div>
          </div>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Loading...
            </p>
          )}

          {/* Search Results View */}
          {!isLoading && isSearching && (
            <div className="p-3">
              {searchResults.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No exercises found for "{searchQuery}"
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground px-1 mb-2">
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                  </p>
                  {searchResults.map((exercise) => (
                    <button
                      key={exercise.id}
                      onClick={() => handleSelect(exercise)}
                      className="w-full text-left px-4 py-3 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <span className="font-medium">{exercise.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {CATEGORY_LABELS[exercise.category]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categories View */}
          {!isLoading && !selectedCategory && !isSearching && (
            <div className="p-3 space-y-1">
              {CATEGORY_ORDER.filter(cat => exerciseCountByCategory[cat] > 0).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{CATEGORY_LABELS[category]}</span>
                    <span className="text-sm text-muted-foreground">
                      {exerciseCountByCategory[category]}
                    </span>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {/* Exercises View */}
          {!isLoading && selectedCategory && (
            <div className="p-3">
              {categoryExercises.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No exercises in this category yet.
                  <br />
                  Add some in the Exercise Library!
                </p>
              ) : (
                <div className="space-y-1">
                  {categoryExercises.map((exercise) => (
                    <button
                      key={exercise.id}
                      onClick={() => handleSelect(exercise)}
                      className="w-full text-left px-4 py-3.5 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
                    >
                      <span className="font-medium">{exercise.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
