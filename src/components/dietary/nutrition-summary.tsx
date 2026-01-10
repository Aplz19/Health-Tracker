"use client";

import { useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { MacroCircle } from "./macro-circle";
import { NutritionDetailSheet } from "./nutrition-detail-sheet";
import { NutritionSettingsSheet } from "./nutrition-settings-sheet";
import { useNutritionGoals } from "@/hooks/use-nutrition-goals";
import type { FoodLogWithFood } from "@/hooks/use-food-logs";

export interface NutritionTotals {
  calories: number;
  protein: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  polyunsaturatedFat: number;
  monounsaturatedFat: number;
  totalCarbohydrates: number;
  fiber: number;
  sugar: number;
  addedSugar: number;
  sodium: number;
  vitaminA: number;
  vitaminC: number;
  vitaminD: number;
  calcium: number;
  iron: number;
}

function calculateTotals(logs: FoodLogWithFood[]): NutritionTotals {
  return logs.reduce(
    (acc, log) => {
      const multiplier = log.servings;
      const food = log.food;

      return {
        calories: acc.calories + food.calories * multiplier,
        protein: acc.protein + food.protein * multiplier,
        totalFat: acc.totalFat + food.total_fat * multiplier,
        saturatedFat: acc.saturatedFat + (food.saturated_fat || 0) * multiplier,
        transFat: acc.transFat + (food.trans_fat || 0) * multiplier,
        polyunsaturatedFat: acc.polyunsaturatedFat + (food.polyunsaturated_fat || 0) * multiplier,
        monounsaturatedFat: acc.monounsaturatedFat + (food.monounsaturated_fat || 0) * multiplier,
        totalCarbohydrates: acc.totalCarbohydrates + food.total_carbohydrates * multiplier,
        fiber: acc.fiber + (food.fiber || 0) * multiplier,
        sugar: acc.sugar + (food.sugar || 0) * multiplier,
        addedSugar: acc.addedSugar + (food.added_sugar || 0) * multiplier,
        sodium: acc.sodium + (food.sodium || 0) * multiplier,
        vitaminA: acc.vitaminA + (food.vitamin_a || 0) * multiplier,
        vitaminC: acc.vitaminC + (food.vitamin_c || 0) * multiplier,
        vitaminD: acc.vitaminD + (food.vitamin_d || 0) * multiplier,
        calcium: acc.calcium + (food.calcium || 0) * multiplier,
        iron: acc.iron + (food.iron || 0) * multiplier,
      };
    },
    {
      calories: 0,
      protein: 0,
      totalFat: 0,
      saturatedFat: 0,
      transFat: 0,
      polyunsaturatedFat: 0,
      monounsaturatedFat: 0,
      totalCarbohydrates: 0,
      fiber: 0,
      sugar: 0,
      addedSugar: 0,
      sodium: 0,
      vitaminA: 0,
      vitaminC: 0,
      vitaminD: 0,
      calcium: 0,
      iron: 0,
    }
  );
}

interface NutritionSummaryProps {
  logs: FoodLogWithFood[];
}

export function NutritionSummary({ logs }: NutritionSummaryProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { goals, calculatedGoals, saveGoals } = useNutritionGoals();
  const totals = calculateTotals(logs);

  return (
    <>
      <div className="rounded-lg border bg-card p-4">
        {/* Settings button */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
            aria-label="Nutrition settings"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          {/* Macro Circles */}
          <div className="flex items-center justify-around flex-1">
            <MacroCircle
              label="Calories"
              current={totals.calories}
              goal={calculatedGoals.calories}
              color="#f97316"
            />
            <MacroCircle
              label="Protein"
              current={totals.protein}
              goal={calculatedGoals.protein}
              unit="g"
              color="#3b82f6"
            />
            <MacroCircle
              label="Carbs"
              current={totals.totalCarbohydrates}
              goal={calculatedGoals.carbs}
              unit="g"
              color="#22c55e"
            />
            <MacroCircle
              label="Fat"
              current={totals.totalFat}
              goal={calculatedGoals.fat}
              unit="g"
              color="#eab308"
            />
          </div>

          {/* More Data Button */}
          <button
            onClick={() => setIsDetailOpen(true)}
            className="ml-2 p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="View detailed nutrition"
          >
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </div>

      <NutritionDetailSheet
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        totals={totals}
        goals={calculatedGoals}
      />

      <NutritionSettingsSheet
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        goals={goals}
        onSave={saveGoals}
      />
    </>
  );
}
