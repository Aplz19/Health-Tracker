"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NutritionGoals } from "@/hooks/use-nutrition-goals";
import { calculateGrams } from "@/hooks/use-nutrition-goals";

interface NutritionSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: NutritionGoals;
  onSave: (goals: NutritionGoals) => void;
}

export function NutritionSettingsSheet({
  open,
  onOpenChange,
  goals,
  onSave,
}: NutritionSettingsSheetProps) {
  const [caloriesStr, setCaloriesStr] = useState(goals.calories.toString());
  const [proteinStr, setProteinStr] = useState(goals.proteinPercent.toString());
  const [carbsStr, setCarbsStr] = useState(goals.carbsPercent.toString());
  const [fatStr, setFatStr] = useState(goals.fatPercent.toString());

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      setCaloriesStr(goals.calories.toString());
      setProteinStr(goals.proteinPercent.toString());
      setCarbsStr(goals.carbsPercent.toString());
      setFatStr(goals.fatPercent.toString());
    }
  }, [open, goals]);

  const calories = parseInt(caloriesStr) || 0;
  const proteinPercent = parseInt(proteinStr) || 0;
  const carbsPercent = parseInt(carbsStr) || 0;
  const fatPercent = parseInt(fatStr) || 0;

  const totalPercent = proteinPercent + carbsPercent + fatPercent;
  const isValid = totalPercent === 100 && calories > 0;

  const calculated = calculateGrams({
    calories,
    proteinPercent,
    carbsPercent,
    fatPercent,
  });

  const handleSave = () => {
    if (isValid) {
      onSave({
        calories,
        proteinPercent,
        carbsPercent,
        fatPercent,
      });
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[90vh] rounded-t-xl">
        <SheetHeader className="pb-6">
          <SheetTitle>Nutrition Goals</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-6">
          {/* Calories Input */}
          <div className="space-y-2">
            <Label htmlFor="calories" className="text-base font-medium">
              Daily Calories
            </Label>
            <Input
              id="calories"
              type="number"
              value={caloriesStr}
              onChange={(e) => setCaloriesStr(e.target.value)}
              className="text-lg h-12 text-center"
              min={0}
              step={50}
            />
          </div>

          {/* Macro Distribution */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Macro Distribution</Label>

            {/* Visual bar */}
            <div className="h-8 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-500 transition-all duration-200"
                style={{ width: `${proteinPercent}%` }}
              />
              <div
                className="bg-green-500 transition-all duration-200"
                style={{ width: `${carbsPercent}%` }}
              />
              <div
                className="bg-yellow-500 transition-all duration-200"
                style={{ width: `${fatPercent}%` }}
              />
            </div>

            {/* Macro inputs */}
            <div className="grid grid-cols-3 gap-3">
              {/* Protein */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium">Protein</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={proteinStr}
                    onChange={(e) => setProteinStr(e.target.value)}
                    className="text-center pr-7"
                    min={0}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    %
                  </span>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {calculated.protein}g
                </p>
              </div>

              {/* Carbs */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm font-medium">Carbs</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={carbsStr}
                    onChange={(e) => setCarbsStr(e.target.value)}
                    className="text-center pr-7"
                    min={0}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    %
                  </span>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {calculated.carbs}g
                </p>
              </div>

              {/* Fat */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="text-sm font-medium">Fat</span>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={fatStr}
                    onChange={(e) => setFatStr(e.target.value)}
                    className="text-center pr-7"
                    min={0}
                    max={100}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    %
                  </span>
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {calculated.fat}g
                </p>
              </div>
            </div>

            {/* Total indicator */}
            {totalPercent !== 100 && (
              <p className="text-center text-sm text-red-500">
                Total must equal 100% (currently {totalPercent}%)
              </p>
            )}
          </div>

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={!isValid}
            className="w-full h-12 text-base"
          >
            Save Goals
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
