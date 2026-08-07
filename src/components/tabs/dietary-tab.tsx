"use client";

import { useState, useMemo } from "react";
import { Plus, Copy, AlertTriangle, Pill } from "lucide-react";
import { useDate } from "@/contexts/date-context";
import { format, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { MealSection } from "@/components/meals/meal-section";
import { NutritionSummary } from "@/components/dietary/nutrition-summary";
import { useMeals } from "@/hooks/use-meals";
import { useFoodLogs } from "@/hooks/use-food-logs";
import { useNutritionDayQuality } from "@/hooks/use-nutrition-day-quality";
import {
  useTrackedItems,
  type TrackedItem,
  type TrackedItemDayLog,
} from "@/hooks/use-tracked-items";
import { SUPPLEMENT_DEFINITIONS } from "@/lib/supplements/config";

// Icon/colour for an item. Migrated supplements keep the icon they always had
// (matched via legacy_key); anything user-created falls back to a generic pill.
function itemVisuals(item: TrackedItem) {
  const def = item.legacy_key
    ? SUPPLEMENT_DEFINITIONS.find((d) => d.key === item.legacy_key)
    : undefined;
  return { Icon: def?.icon ?? Pill, color: def?.color ?? "text-primary" };
}

// Manual row: type the amount taken.
function ManualItemRow({
  item,
  amount,
  onUpdate,
}: {
  item: TrackedItem;
  amount: number;
  onUpdate: (value: number) => void;
}) {
  const [value, setValue] = useState(amount.toString());
  const { Icon, color } = itemVisuals(item);

  const handleBlur = () => {
    const numValue = parseFloat(value) || 0;
    if (numValue !== amount) onUpdate(numValue);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={"h-4 w-4 shrink-0 " + color} />
        <span className="truncate text-sm font-medium">{item.name}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="h-7 w-20 text-center text-sm"
          min={0}
        />
        <span className="w-8 text-xs text-muted-foreground">{item.unit}</span>
      </div>
    </div>
  );
}

// Checkbox row. One checkbox per scheduled dose, so a twice-daily medication
// can record "took the morning, missed the evening".
//
// Taken-ness is decided by what was logged that day, NEVER by comparing against
// the item's current goal — raising a goal from 5000 to 10000 used to make
// every past day logged at 5000 render as skipped.
function DoseItemRow({
  item,
  log,
  onSetDoses,
}: {
  item: TrackedItem;
  log: TrackedItemDayLog | undefined;
  onSetDoses: (doses: number) => void;
}) {
  const { Icon, color } = itemVisuals(item);
  const scheduled = Math.max(1, item.doses_per_day);
  const taken = log ? log.doses_taken || (log.amount > 0 ? 1 : 0) : 0;
  const perDose = item.dose_amount ?? item.goal_amount ?? 0;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Icon className={"h-4 w-4 shrink-0 " + color} />
        <div className="min-w-0">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          {perDose > 0 && (
            <span className="block text-xs text-muted-foreground">
              {perDose} {item.unit}
              {scheduled > 1 ? " × " + scheduled + "/day" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {taken > 0 && (
          <span className="text-xs text-green-500">
            {scheduled > 1 ? taken + "/" + scheduled : "taken"}
          </span>
        )}
        <div className="flex items-center gap-1">
          {Array.from({ length: scheduled }).map((_, i) => (
            <Checkbox
              key={i}
              checked={i < taken}
              aria-label={item.name + " dose " + (i + 1) + " of " + scheduled}
              // Ticking dose 3 means 3 taken; unticking dose 3 means 2.
              onCheckedChange={(checked) => onSetDoses(checked === true ? i + 1 : i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TrackedItemRow({
  item,
  log,
  onSetDoses,
  onSetAmount,
}: {
  item: TrackedItem;
  log: TrackedItemDayLog | undefined;
  onSetDoses: (doses: number) => void;
  onSetAmount: (amount: number) => void;
}) {
  if (item.kind === "supplement" && item.tracking_mode === "manual") {
    return (
      <ManualItemRow
        key={item.id + ":" + (log?.amount ?? 0)}
        item={item}
        amount={log?.amount ?? 0}
        onUpdate={onSetAmount}
      />
    );
  }
  return <DoseItemRow item={item} log={log} onSetDoses={onSetDoses} />;
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

  // Supplements and medications now come from one generic table (see
  // NOTES_supplements_medications_migration.md). This single hook replaces the
  // ~15 useSupplement calls that used to sit here, one per hardcoded table.
  const {
    supplements: supplementItems,
    medications: medicationItems,
    logs: itemLogs,
    available: itemsAvailable,
    isLoading: isItemsLoading,
    setDosesTaken,
    setDayLog,
    fillFromDate,
  } = useTrackedItems(dateString);

  const enabledSupplements = useMemo(
    () => supplementItems.filter((i) => i.is_enabled),
    [supplementItems]
  );
  const enabledMedications = useMemo(
    () => medicationItems.filter((i) => i.is_enabled),
    [medicationItems]
  );

  // Per-day nutrition data-quality flag (bottom of this tab).
  const dayQuality = useNutritionDayQuality(dateString);

  const [isFilling, setIsFilling] = useState(false);

  const fillFromYesterday = async () => {
    setIsFilling(true);
    try {
      // selectedDate is already local time. Parsing its YYYY-MM-DD string with
      // new Date() treats it as UTC and can skip an extra day in US time zones.
      const yesterday = format(subDays(selectedDate, 1), "yyyy-MM-dd");
      await fillFromDate(yesterday, enabledSupplements);
    } catch (err) {
      console.error("Failed to fill from yesterday:", err);
    } finally {
      setIsFilling(false);
    }
  };

  const isLoading = isMealsLoading || isLogsLoading;

  const renderItems = (items: TrackedItem[]) =>
    items.map((item) => (
      <TrackedItemRow
        key={item.id}
        item={item}
        log={itemLogs[item.id]}
        onSetDoses={(doses) => {
          setDosesTaken(item, doses).catch(() => {
            // Hook rolls the checkbox back on failure.
          });
        }}
        onSetAmount={(amount) => {
          setDayLog(item.id, amount, amount > 0 ? 1 : 0).catch(() => {});
        }}
      />
    ));

  return (
    <div className="space-y-4 p-4">
      <div className="text-center text-sm text-muted-foreground">
        {format(selectedDate, "EEEE, MMMM d, yyyy")}
      </div>

      {/* Flagged-day marker: without this, scrolling back to a low-calorie day
          months later gives no hint that it was deliberately not tracked. */}
      {dayQuality.isIncomplete && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-yellow-600/50 bg-yellow-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-600" />
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            Nutrition marked incomplete — this day is excluded from analysis.
          </p>
        </div>
      )}

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
        <Button onClick={addMeal} variant="outline" className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Meal
        </Button>
      )}

      {/* Medications — only rendered when you actually take some, so the
          section stays out of the way otherwise. */}
      {itemsAvailable && enabledMedications.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">
            Medications
          </span>
          {renderItems(enabledMedications)}
        </div>
      )}

      {/* Daily Supplements Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">
            Daily Supplements
          </span>
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

        {isItemsLoading ? (
          <div className="rounded-lg border bg-card px-4 py-3 text-center">
            <span className="text-sm text-muted-foreground">
              Loading supplements...
            </span>
          </div>
        ) : enabledSupplements.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No supplements tracked. Add some in Settings.
            </p>
          </div>
        ) : (
          renderItems(enabledSupplements)
        )}
      </div>

      {/* Day data quality — marks this day's nutrition as not trustworthy so
          it is excluded from analysis. Hidden until the migration is applied. */}
      {dayQuality.available && (
        <div className="space-y-2">
          <span className="text-sm font-medium text-muted-foreground">
            Day Data Quality
          </span>
          <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
            <label
              htmlFor="nutrition-incomplete"
              className="flex-1 min-w-0 cursor-pointer pr-3"
            >
              <span className="font-medium text-sm">Incomplete nutrition</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                Excludes this day from nutrition analysis
              </span>
            </label>
            <Checkbox
              id="nutrition-incomplete"
              checked={dayQuality.isIncomplete}
              disabled={dayQuality.isSaving}
              onCheckedChange={(checked) => {
                dayQuality
                  .setQuality(checked === true ? "incomplete" : null)
                  .catch(() => {
                    // Hook rolls the checkbox back on failure.
                  });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
