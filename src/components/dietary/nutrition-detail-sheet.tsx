"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { NutritionTotals } from "./nutrition-summary";

interface NutritionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totals: NutritionTotals;
  goals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

function NutritionRow({
  label,
  value,
  unit = "g",
  indent = false,
  bold = false,
}: {
  label: string;
  value: number;
  unit?: string;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between py-2 ${indent ? "pl-4" : ""}`}>
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={bold ? "font-medium" : ""}>
        {Math.round(value * 10) / 10}
        {unit}
      </span>
    </div>
  );
}

function GoalRow({
  label,
  current,
  goal,
  unit = "g",
}: {
  label: string;
  current: number;
  goal: number;
  unit?: string;
}) {
  const remaining = goal - current;
  const isOver = remaining < 0;

  return (
    <div className="flex justify-between py-2">
      <span className="font-medium">{label}</span>
      <div className="text-right">
        <span className="font-medium">
          {Math.round(current)}{unit}
        </span>
        <span className="text-muted-foreground text-sm">
          {" / "}
          {goal}{unit}
        </span>
        <span className={`text-sm ml-2 ${isOver ? "text-red-500" : "text-green-500"}`}>
          ({isOver ? "" : "+"}{Math.round(remaining)})
        </span>
      </div>
    </div>
  );
}

export function NutritionDetailSheet({
  open,
  onOpenChange,
  totals,
  goals,
}: NutritionDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-xl">
        <SheetHeader className="pb-4">
          <SheetTitle>Daily Nutrition</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(85vh-80px)] pr-4">
          <div className="space-y-1">
            {/* Goals Section */}
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Daily Goals
              </h3>
              <div className="rounded-lg border bg-muted/30 px-4">
                <GoalRow label="Calories" current={totals.calories} goal={goals.calories} unit="" />
                <Separator />
                <GoalRow label="Protein" current={totals.protein} goal={goals.protein} />
                <Separator />
                <GoalRow label="Carbs" current={totals.totalCarbohydrates} goal={goals.carbs} />
                <Separator />
                <GoalRow label="Fat" current={totals.totalFat} goal={goals.fat} />
              </div>
            </div>

            {/* Fat Breakdown */}
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Fat Breakdown
              </h3>
              <div className="rounded-lg border bg-muted/30 px-4">
                <NutritionRow label="Total Fat" value={totals.totalFat} bold />
                <Separator />
                <NutritionRow label="Saturated Fat" value={totals.saturatedFat} indent />
                <Separator />
                <NutritionRow label="Trans Fat" value={totals.transFat} indent />
                <Separator />
                <NutritionRow label="Polyunsaturated Fat" value={totals.polyunsaturatedFat} indent />
                <Separator />
                <NutritionRow label="Monounsaturated Fat" value={totals.monounsaturatedFat} indent />
              </div>
            </div>

            {/* Carbohydrate Breakdown */}
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Carbohydrate Breakdown
              </h3>
              <div className="rounded-lg border bg-muted/30 px-4">
                <NutritionRow label="Total Carbohydrates" value={totals.totalCarbohydrates} bold />
                <Separator />
                <NutritionRow label="Dietary Fiber" value={totals.fiber} indent />
                <Separator />
                <NutritionRow label="Total Sugars" value={totals.sugar} indent />
                <Separator />
                <NutritionRow label="Added Sugars" value={totals.addedSugar} indent />
              </div>
            </div>

            {/* Other Nutrients */}
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Other Nutrients
              </h3>
              <div className="rounded-lg border bg-muted/30 px-4">
                <NutritionRow label="Sodium" value={totals.sodium} unit="mg" />
              </div>
            </div>

            {/* Vitamins & Minerals */}
            <div className="pb-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Vitamins & Minerals
              </h3>
              <div className="rounded-lg border bg-muted/30 px-4">
                <NutritionRow label="Vitamin A" value={totals.vitaminA} unit="%" />
                <Separator />
                <NutritionRow label="Vitamin C" value={totals.vitaminC} unit="%" />
                <Separator />
                <NutritionRow label="Vitamin D" value={totals.vitaminD} unit="%" />
                <Separator />
                <NutritionRow label="Calcium" value={totals.calcium} unit="%" />
                <Separator />
                <NutritionRow label="Iron" value={totals.iron} unit="%" />
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
