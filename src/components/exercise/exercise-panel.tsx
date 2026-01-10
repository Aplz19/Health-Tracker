"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddExerciseForm } from "./add-exercise-form";
import { useExercises } from "@/hooks/use-exercises";
import { cn } from "@/lib/utils";
import type { Exercise, ExerciseCategory } from "@/lib/supabase/types";

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
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

const CATEGORY_ORDER: ExerciseCategory[] = [
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

type PanelView = "categories" | "category-detail" | "add-form";

export function ExercisePanel() {
  const [currentView, setCurrentView] = useState<PanelView>("categories");
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  const { exercises, isLoading, addExercise, updateExercise, deleteExercise } =
    useExercises();

  // Count exercises per category
  const exerciseCountByCategory = CATEGORY_ORDER.reduce((acc, category) => {
    acc[category] = exercises.filter((ex) => ex.category === category).length;
    return acc;
  }, {} as Record<ExerciseCategory, number>);

  // Get exercises for selected category
  const categoryExercises = selectedCategory
    ? exercises.filter((ex) => ex.category === selectedCategory)
    : [];

  const showCategories = () => {
    setCurrentView("categories");
    setSelectedCategory(null);
    setEditingExercise(null);
  };

  const showCategoryDetail = (category: ExerciseCategory) => {
    setSelectedCategory(category);
    setCurrentView("category-detail");
  };

  const showAddForm = (category?: ExerciseCategory) => {
    setEditingExercise(null);
    if (category) {
      setSelectedCategory(category);
    }
    setCurrentView("add-form");
  };

  const showEditForm = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setCurrentView("add-form");
  };

  const handleFormSubmit = async (data: { name: string; category: ExerciseCategory }) => {
    if (editingExercise) {
      await updateExercise(editingExercise.id, data);
    } else {
      await addExercise(data);
    }
    // Go back to category detail if we came from there, otherwise categories
    if (selectedCategory) {
      setCurrentView("category-detail");
    } else {
      setCurrentView("categories");
    }
    setEditingExercise(null);
  };

  const handleBack = () => {
    if (currentView === "add-form") {
      if (selectedCategory) {
        setCurrentView("category-detail");
      } else {
        setCurrentView("categories");
      }
      setEditingExercise(null);
    } else if (currentView === "category-detail") {
      showCategories();
    }
  };

  // Calculate transform based on view
  const getTransform = () => {
    switch (currentView) {
      case "categories":
        return "translate-x-0";
      case "category-detail":
        return "-translate-x-1/3";
      case "add-form":
        return "-translate-x-2/3";
      default:
        return "translate-x-0";
    }
  };

  return (
    <div className="relative overflow-hidden h-full">
      <div
        className={cn(
          "flex h-full transition-transform duration-300 ease-in-out",
          getTransform()
        )}
        style={{ width: "300%" }}
      >
        {/* Categories View */}
        <div className="w-1/3 h-full flex flex-col">
          <div className="p-4 border-b">
            <Button onClick={() => showAddForm()} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create New Exercise
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {isLoading && (
                <p className="text-center text-sm text-muted-foreground py-8">
                  Loading...
                </p>
              )}

              {!isLoading &&
                CATEGORY_ORDER.map((category) => (
                  <button
                    key={category}
                    onClick={() => showCategoryDetail(category)}
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
          </ScrollArea>
        </div>

        {/* Category Detail View */}
        <div className="w-1/3 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 p-4 border-b">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBack}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold">
              {selectedCategory ? CATEGORY_LABELS[selectedCategory] : ""}
            </h2>
          </div>

          {/* Add button for this category */}
          <div className="p-4 border-b">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => showAddForm(selectedCategory || undefined)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {selectedCategory ? CATEGORY_LABELS[selectedCategory] : ""} Exercise
            </Button>
          </div>

          {/* Exercise List */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              {categoryExercises.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No exercises in this category yet
                </p>
              ) : (
                <div className="space-y-2">
                  {categoryExercises.map((exercise) => (
                    <div
                      key={exercise.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="font-medium">{exercise.name}</span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => showEditForm(exercise)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteExercise(exercise.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Add/Edit Form View */}
        <div className="w-1/3 h-full flex flex-col">
          {/* Form Header */}
          <div className="flex items-center gap-2 p-4 border-b">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBack}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold">
              {editingExercise ? "Edit Exercise" : "New Exercise"}
            </h2>
          </div>

          {/* Form */}
          <AddExerciseForm
            editingExercise={editingExercise}
            defaultCategory={selectedCategory || undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleBack}
          />
        </div>
      </div>
    </div>
  );
}
