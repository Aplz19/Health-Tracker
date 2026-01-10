"use client";

import { useState, useEffect } from "react";
import { Plus, Pill, Moon, Coffee, Sun, Leaf, Zap, Copy } from "lucide-react";
import { useDate } from "@/contexts/date-context";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MealSection } from "@/components/meals/meal-section";
import { NutritionSummary } from "@/components/dietary/nutrition-summary";
import { useMeals } from "@/hooks/use-meals";
import { useFoodLogs } from "@/hooks/use-food-logs";
import { useSupplement, fetchYesterdayAmount } from "@/hooks/use-supplement";
import type { LucideIcon } from "lucide-react";

// Supplement configuration
interface SupplementConfig {
  key: string;
  table: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  color: string;
  step?: number;
}

const SUPPLEMENTS: SupplementConfig[] = [
  { key: "creatine", table: "creatine_logs", label: "Creatine", unit: "g", icon: Pill, color: "text-purple-500" },
  { key: "d3", table: "d3_logs", label: "Vitamin D3", unit: "IU", icon: Sun, color: "text-yellow-500" },
  { key: "k2", table: "k2_logs", label: "Vitamin K2", unit: "mcg", icon: Leaf, color: "text-green-500" },
  { key: "vitaminC", table: "vitamin_c_logs", label: "Vitamin C", unit: "mg", icon: Zap, color: "text-orange-500" },
  { key: "zinc", table: "zinc_logs", label: "Zinc", unit: "mg", icon: Pill, color: "text-slate-400" },
  { key: "magnesium", table: "magnesium_logs", label: "Magnesium", unit: "mg", icon: Pill, color: "text-teal-500" },
  { key: "melatonin", table: "melatonin_logs", label: "Melatonin", unit: "mg", icon: Moon, color: "text-blue-500", step: 0.5 },
  { key: "caffeine", table: "caffeine_logs", label: "Caffeine", unit: "mg", icon: Coffee, color: "text-amber-600" },
];

// Individual supplement row component
function SupplementRow({
  config,
  amount,
  onUpdate,
}: {
  config: SupplementConfig;
  amount: number;
  onUpdate: (value: number) => void;
}) {
  const [value, setValue] = useState(amount.toString());

  useEffect(() => {
    setValue(amount.toString());
  }, [amount]);

  const handleBlur = () => {
    const numValue = parseFloat(value) || 0;
    if (numValue !== amount) {
      onUpdate(numValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const Icon = config.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <span className="font-medium text-sm">{config.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-16 h-7 text-center text-sm"
          min={0}
          step={config.step}
        />
        <span className="text-xs text-muted-foreground w-6">{config.unit}</span>
      </div>
    </div>
  );
}

export function DietaryTab() {
  const { selectedDate } = useDate();
  const dateString = format(selectedDate, "yyyy-MM-dd");

  const {
    meals,
    isLoading: isMealsLoading,
    addMeal,
    updateMeal,
    deleteMeal,
  } = useMeals(dateString);

  const {
    logs,
    isLoading: isLogsLoading,
    addLog,
    updateLog,
    deleteLog,
    getLogsByMealId,
  } = useFoodLogs(dateString);

  // Supplements - using individual hooks
  const creatine = useSupplement("creatine_logs", dateString);
  const d3 = useSupplement("d3_logs", dateString);
  const k2 = useSupplement("k2_logs", dateString);
  const vitaminC = useSupplement("vitamin_c_logs", dateString);
  const zinc = useSupplement("zinc_logs", dateString);
  const magnesium = useSupplement("magnesium_logs", dateString);
  const melatonin = useSupplement("melatonin_logs", dateString);
  const caffeine = useSupplement("caffeine_logs", dateString);

  const supplementData: Record<string, { amount: number; hasRecord: boolean; updateAmount: (v: number) => void; refetch: () => void }> = {
    creatine,
    d3,
    k2,
    vitaminC,
    zinc,
    magnesium,
    melatonin,
    caffeine,
  };

  const [isFilling, setIsFilling] = useState(false);

  const fillFromYesterday = async () => {
    setIsFilling(true);
    try {
      const yesterday = format(subDays(new Date(dateString), 1), "yyyy-MM-dd");

      // Fetch all yesterday's values and save them for today
      await Promise.all(
        SUPPLEMENTS.map(async (config) => {
          const yesterdayAmount = await fetchYesterdayAmount(config.table, yesterday);
          await supplementData[config.key].updateAmount(yesterdayAmount);
        })
      );
    } catch (err) {
      console.error("Failed to fill from yesterday:", err);
    } finally {
      setIsFilling(false);
    }
  };

  const isLoading = isMealsLoading || isLogsLoading;

  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      {/* Nutrition Summary */}
      <NutritionSummary logs={logs} />

      {/* Dynamic Meal Sections */}
      {meals.map((meal) => (
        <MealSection
          key={meal.id}
          meal={meal}
          logs={getLogsByMealId(meal.id)}
          isLoading={isLoading}
          onAddLog={(foodId, servings) => addLog(foodId, meal.id, servings)}
          onUpdateLog={updateLog}
          onDeleteLog={deleteLog}
          onUpdateMeal={(updates) => updateMeal(meal.id, updates)}
          onDeleteMeal={() => deleteMeal(meal.id)}
        />
      ))}

      {/* Empty State */}
      {!isLoading && meals.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-muted p-8 text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No meals logged for this day
          </p>
          <Button onClick={addMeal} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Meal
          </Button>
        </div>
      )}

      {/* Add Meal Button (when meals exist) */}
      {meals.length > 0 && (
        <Button
          onClick={addMeal}
          variant="outline"
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Meal
        </Button>
      )}

      {/* Supplements Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Supplements</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={fillFromYesterday}
            disabled={isFilling}
          >
            <Copy className="h-3 w-3 mr-1" />
            {isFilling ? "Filling..." : "Fill from yesterday"}
          </Button>
        </div>
        {SUPPLEMENTS.map((config) => (
          <SupplementRow
            key={config.key}
            config={config}
            amount={supplementData[config.key].amount}
            onUpdate={supplementData[config.key].updateAmount}
          />
        ))}
      </div>
    </div>
  );
}
