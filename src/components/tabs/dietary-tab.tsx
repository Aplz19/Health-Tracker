"use client";

import { useState, useEffect } from "react";
import { Plus, Copy, X, Pill } from "lucide-react";
import { useDate } from "@/contexts/date-context";
import { useApp } from "@/contexts/app-context";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MealSection } from "@/components/meals/meal-section";
import { NutritionSummary } from "@/components/dietary/nutrition-summary";
import { useMeals } from "@/hooks/use-meals";
import { useFoodLogs } from "@/hooks/use-food-logs";
import { useSupplement, fetchYesterdayAmount } from "@/hooks/use-supplement";
import { useSupplementLogs } from "@/hooks/use-supplement-logs";
import { useSupplementPreferencesContext } from "@/contexts/supplement-preferences-context";
import type { UserSupplement } from "@/types/supplements";

// Manual mode supplement row - number input
function ManualSupplementRow({
  supplement,
  amount,
  onUpdate,
}: {
  supplement: UserSupplement;
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

  const Icon = supplement.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${supplement.definition.color}`} />
        <span className="font-medium text-sm">{supplement.definition.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-20 h-7 text-center text-sm"
          min={0}
          step={supplement.definition.step}
        />
        <span className="text-xs text-muted-foreground w-8">
          {supplement.definition.unit}
        </span>
      </div>
    </div>
  );
}

// Goal mode supplement row - checkbox
function GoalSupplementRow({
  supplement,
  amount,
  onToggle,
}: {
  supplement: UserSupplement;
  amount: number;
  onToggle: (checked: boolean) => void;
}) {
  const isChecked = amount >= supplement.goalAmount;
  const Icon = supplement.definition.icon;

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`goal-${supplement.definition.key}`}
          checked={isChecked}
          onCheckedChange={(checked) => onToggle(checked === true)}
        />
        <label
          htmlFor={`goal-${supplement.definition.key}`}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Icon className={`h-4 w-4 ${supplement.definition.color}`} />
          <span className="font-medium text-sm">{supplement.definition.label}</span>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-sm ${isChecked ? "text-green-500" : "text-muted-foreground"}`}>
          {amount}
        </span>
        <span className="text-xs text-muted-foreground">
          / {supplement.goalAmount} {supplement.definition.unit}
        </span>
      </div>
    </div>
  );
}

// Wrapper component that handles both modes
function SupplementRowWrapper({
  supplement,
  supplementHook,
}: {
  supplement: UserSupplement;
  supplementHook: ReturnType<typeof useSupplement>;
}) {
  const handleGoalToggle = (checked: boolean) => {
    supplementHook.updateAmount(checked ? supplement.goalAmount : 0);
  };

  if (supplement.trackingMode === "goal") {
    return (
      <GoalSupplementRow
        supplement={supplement}
        amount={supplementHook.amount}
        onToggle={handleGoalToggle}
      />
    );
  }

  return (
    <ManualSupplementRow
      supplement={supplement}
      amount={supplementHook.amount}
      onUpdate={supplementHook.updateAmount}
    />
  );
}

export function DietaryTab() {
  const { selectedDate } = useDate();
  const { openSupplementLibrary } = useApp();
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

  // Get enabled supplements from preferences
  const { getEnabledSupplements, isLoading: isPrefsLoading } = useSupplementPreferencesContext();
  const enabledSupplements = getEnabledSupplements();

  // Ad-hoc supplement logs
  const {
    logs: supplementLogs,
    isLoading: isSupplementLogsLoading,
    deleteLog: deleteSupplementLog,
  } = useSupplementLogs(dateString);

  // Create hooks for all possible supplements (needed for consistent hook calls)
  // Original supplements
  const creatine = useSupplement("creatine_logs", dateString);
  const d3 = useSupplement("d3_logs", dateString);
  const k2 = useSupplement("k2_logs", dateString);
  const vitaminC = useSupplement("vitamin_c_logs", dateString);
  const zinc = useSupplement("zinc_logs", dateString);
  const magnesium = useSupplement("magnesium_logs", dateString);
  const melatonin = useSupplement("melatonin_logs", dateString);
  const caffeine = useSupplement("caffeine_logs", dateString);
  // New supplements
  const fishOil = useSupplement("fish_oil_logs", dateString);
  const vitaminA = useSupplement("vitamin_a_logs", dateString);
  const vitaminE = useSupplement("vitamin_e_logs", dateString);
  const vitaminB12 = useSupplement("vitamin_b12_logs", dateString);
  const vitaminBComplex = useSupplement("vitamin_b_complex_logs", dateString);
  const folate = useSupplement("folate_logs", dateString);
  const biotin = useSupplement("biotin_logs", dateString);

  const supplementHooks: Record<string, ReturnType<typeof useSupplement>> = {
    creatine,
    d3,
    k2,
    vitaminC,
    zinc,
    magnesium,
    melatonin,
    caffeine,
    fishOil,
    vitaminA,
    vitaminE,
    vitaminB12,
    vitaminBComplex,
    folate,
    biotin,
  };

  const [isFilling, setIsFilling] = useState(false);

  const fillFromYesterday = async () => {
    setIsFilling(true);
    try {
      const yesterday = format(subDays(new Date(dateString), 1), "yyyy-MM-dd");

      // Only fill enabled supplements
      await Promise.all(
        enabledSupplements.map(async (supplement) => {
          const hook = supplementHooks[supplement.definition.key];
          if (hook) {
            const yesterdayAmount = await fetchYesterdayAmount(
              supplement.definition.table,
              yesterday
            );
            await hook.updateAmount(yesterdayAmount);
          }
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

      {/* Daily Supplements Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Daily Supplements</span>
          {enabledSupplements.length > 0 && (
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
          )}
        </div>

        {isPrefsLoading ? (
          <div className="rounded-lg border bg-card px-4 py-3 text-center">
            <span className="text-sm text-muted-foreground">Loading supplements...</span>
          </div>
        ) : enabledSupplements.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No supplements tracked. Add some in Settings.
            </p>
          </div>
        ) : (
          enabledSupplements.map((supplement) => {
            const hook = supplementHooks[supplement.definition.key];
            if (!hook) return null;
            return (
              <SupplementRowWrapper
                key={supplement.definition.key}
                supplement={supplement}
                supplementHook={hook}
              />
            );
          })
        )}
      </div>

      {/* Other Supplements Section (ad-hoc logging) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Other Supplements</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={openSupplementLibrary}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        {isSupplementLogsLoading ? (
          <div className="rounded-lg border bg-card px-4 py-3 text-center">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : supplementLogs.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Log occasional supplements here
            </p>
          </div>
        ) : (
          supplementLogs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-2"
            >
              <div className="flex items-center gap-2">
                <Pill className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{log.supplement_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {log.amount} {log.unit}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => deleteSupplementLog(log.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
