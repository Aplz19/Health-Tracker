"use client";

import { useState, useEffect } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FoodPickerDialog } from "@/components/food/food-picker-dialog";
import { MealTimePicker } from "@/components/meals/meal-time-picker";
import type { Food, Meal } from "@/lib/supabase/types";
import type { FoodLogWithFood } from "@/hooks/use-food-logs";

// Separate component for the servings input to manage local state
function ServingsInput({
  logId,
  initialServings,
  onUpdate,
}: {
  logId: string;
  initialServings: number;
  onUpdate: (logId: string, servings: number) => Promise<void>;
}) {
  const [value, setValue] = useState(initialServings);

  // Sync with external changes
  useEffect(() => {
    setValue(initialServings);
  }, [initialServings]);

  const handleBlur = () => {
    const newValue = Math.max(0.01, value);
    if (newValue !== initialServings) {
      onUpdate(logId, newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  return (
    <Input
      type="number"
      value={value === 0 ? "" : value}
      onChange={(e) => setValue(e.target.value === "" ? 0 : Number(e.target.value))}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-16 h-7 text-center text-xs"
      min={0.01}
      step={1}
    />
  );
}

interface MealSectionProps {
  meal: Meal;
  logs: FoodLogWithFood[];
  isLoading: boolean;
  onAddLog: (foodId: string, servings: number) => Promise<unknown>;
  onUpdateLog: (logId: string, servings: number) => Promise<void>;
  onDeleteLog: (logId: string) => Promise<void>;
  onUpdateMeal: (updates: Partial<Pick<Meal, "name" | "time_hour" | "time_minute" | "is_pm">>) => Promise<void>;
  onDeleteMeal: () => Promise<void>;
}

export function MealSection({
  meal,
  logs,
  isLoading,
  onAddLog,
  onUpdateLog,
  onDeleteLog,
  onUpdateMeal,
  onDeleteMeal,
}: MealSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(meal.name);

  // Sync name with meal
  useEffect(() => {
    setNameValue(meal.name);
  }, [meal.name]);

  const addFoodToMeal = async (food: Food, servings: number) => {
    try {
      await onAddLog(food.id, servings);
    } catch {
      // Error handled by hook
    }
  };

  const handleNameBlur = () => {
    setIsEditingName(false);
    if (nameValue.trim() && nameValue !== meal.name) {
      onUpdateMeal({ name: nameValue.trim() });
    } else {
      setNameValue(meal.name);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setNameValue(meal.name);
      setIsEditingName(false);
    }
  };

  const handleTimeChange = (hour: number, minute: number, isPm: boolean) => {
    onUpdateMeal({ time_hour: hour, time_minute: minute, is_pm: isPm });
  };

  const totalCalories = logs.reduce(
    (sum, log) => sum + log.food.calories * log.servings,
    0
  );
  const totalProtein = logs.reduce(
    (sum, log) => sum + log.food.protein * log.servings,
    0
  );
  const totalCarbs = logs.reduce(
    (sum, log) => sum + log.food.total_carbohydrates * log.servings,
    0
  );
  const totalFat = logs.reduce(
    (sum, log) => sum + log.food.total_fat * log.servings,
    0
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Editable Name */}
          {isEditingName ? (
            <Input
              type="text"
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={handleNameBlur}
              onKeyDown={handleNameKeyDown}
              className="h-7 w-32 text-sm font-medium"
              autoFocus
            />
          ) : (
            <button
              onClick={() => setIsEditingName(true)}
              className="font-medium hover:text-primary transition-colors truncate"
            >
              {meal.name}
            </button>
          )}

          {/* Time Picker */}
          <MealTimePicker
            hour={meal.time_hour}
            minute={meal.time_minute}
            isPm={meal.is_pm}
            onChange={handleTimeChange}
          />
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {Math.round(totalCalories)} cal
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDeleteMeal}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="relative">
        {/* Loading State */}
        {isLoading && logs.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        )}

        {/* Logged Foods */}
        {logs.length > 0 && (
          <div className="p-2 space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{log.food.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(log.food.calories * log.servings)} cal |{" "}
                    {Math.round(log.food.protein * log.servings)}g P |{" "}
                    {Math.round(log.food.total_carbohydrates * log.servings)}g C |{" "}
                    {Math.round(log.food.total_fat * log.servings)}g F
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <ServingsInput
                    logId={log.id}
                    initialServings={log.servings}
                    onUpdate={onUpdateLog}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteLog(log.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Totals */}
        {logs.length > 0 && (
          <div className="px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Total:</span>
              <span>
                {Math.round(totalProtein)}g P | {Math.round(totalCarbs)}g C |{" "}
                {Math.round(totalFat)}g F
              </span>
            </div>
          </div>
        )}

        {/* Add Button */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full h-9 rounded-none border-t text-muted-foreground"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Food
        </Button>
      </div>

      {/* Food Picker Dialog */}
      <FoodPickerDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        mealTitle={meal.name}
        onSelectFood={addFoodToMeal}
      />
    </div>
  );
}
