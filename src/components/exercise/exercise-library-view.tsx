"use client";

import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/exercise-categories";
import type { Exercise, ExerciseCategory } from "@/lib/supabase/types";

interface ExerciseLibraryViewProps {
  exercises: Exercise[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddExercise: () => void;
  onEditExercise: (exercise: Exercise) => void;
  onDeleteExercise: (id: string) => Promise<void>;
}

export function ExerciseLibraryView({
  exercises,
  isLoading,
  searchQuery,
  onSearchChange,
  onAddExercise,
  onEditExercise,
  onDeleteExercise,
}: ExerciseLibraryViewProps) {
  // Group exercises by category
  const groupedExercises = CATEGORY_ORDER.reduce((acc, category) => {
    const categoryExercises = exercises.filter((ex) => ex.category === category);
    if (categoryExercises.length > 0) {
      acc[category] = categoryExercises;
    }
    return acc;
  }, {} as Record<ExerciseCategory, Exercise[]>);

  const hasExercises = Object.keys(groupedExercises).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Search and Add Button */}
      <div className="p-4 space-y-3 border-b">
        <Button onClick={onAddExercise} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Create Exercise
        </Button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search exercises..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Exercise List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isLoading && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Loading...
            </p>
          )}

          {!isLoading && !hasExercises && (
            <p className="text-center text-sm text-muted-foreground py-8">
              {searchQuery ? "No exercises found" : "No exercises yet. Create one!"}
            </p>
          )}

          {!isLoading && hasExercises && (
            <div className="space-y-6">
              {CATEGORY_ORDER.map((category) => {
                const categoryExercises = groupedExercises[category];
                if (!categoryExercises) return null;

                return (
                  <div key={category}>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {CATEGORY_LABELS[category]}
                    </h3>
                    <div className="space-y-1">
                      {categoryExercises.map((exercise) => (
                        <div
                          key={exercise.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <span className="font-medium">{exercise.name}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onEditExercise(exercise)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => onDeleteExercise(exercise.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
