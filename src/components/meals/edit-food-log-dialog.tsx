"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Food } from "@/lib/supabase/types";

interface ParsedServing {
  amount: number;
  unit: string;
  gramsPerUnit: number;
}

// Weight/volume units and their conversion to grams
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  kg: 1000,
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
};

const TRACKABLE_UNITS = ['g', 'gram', 'grams', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'kg', 'ml', 'l', 'liter', 'liters'];

// Normalize unit to canonical form
function normalizeUnit(unit: string): string {
  const normalized = unit.toLowerCase().replace(/s$/, '');
  const canonicalMap: Record<string, string> = {
    gram: 'g',
    ounce: 'oz',
    pound: 'lb',
    liter: 'l',
  };
  return canonicalMap[normalized] || normalized;
}

// Parse serving size to find ALL trackable weight/volume units
function parseAllServingSizes(servingSize: string, servingSizeGrams: number | null): ParsedServing[] {
  const lowerServing = servingSize.toLowerCase();
  const results: ParsedServing[] = [];
  const foundUnits = new Set<string>();

  for (const unit of TRACKABLE_UNITS) {
    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}(?:\\s|\\)|$|,)`, 'i');
    const match = lowerServing.match(regex);
    if (match) {
      const canonicalUnit = normalizeUnit(unit);
      if (foundUnits.has(canonicalUnit)) continue;
      foundUnits.add(canonicalUnit);

      const amount = parseFloat(match[1]);
      const gramsPerUnit = UNIT_TO_GRAMS[unit] || 1;
      results.push({
        amount,
        unit: canonicalUnit,
        gramsPerUnit,
      });
    }
  }

  if (results.length === 0 && servingSizeGrams && servingSizeGrams > 0) {
    results.push({
      amount: servingSizeGrams,
      unit: 'g',
      gramsPerUnit: 1,
    });
  }

  return results;
}

function getUnitDisplayName(unit: string): string {
  const unitNames: Record<string, string> = {
    g: "Grams",
    gram: "Grams",
    oz: "Ounces",
    ounce: "Ounces",
    lb: "Pounds",
    pound: "Pounds",
    kg: "Kilograms",
    ml: "Milliliters",
    l: "Liters",
    liter: "Liters",
  };
  return unitNames[unit] || unit.charAt(0).toUpperCase() + unit.slice(1);
}

function getUnitShortLabel(unit: string): string {
  const labels: Record<string, string> = {
    g: "g",
    gram: "g",
    oz: "oz",
    ounce: "oz",
    lb: "lb",
    pound: "lb",
    kg: "kg",
    ml: "ml",
    l: "L",
    liter: "L",
  };
  return labels[unit] || unit;
}

type UnitType = "serving" | "custom";

interface EditFoodLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: Food;
  currentServings: number;
  onSave: (servings: number) => void;
}

export function EditFoodLogDialog({
  open,
  onOpenChange,
  food,
  currentServings,
  onSave,
}: EditFoodLogDialogProps) {
  const [unit, setUnit] = useState<UnitType>("serving");
  const [amount, setAmount] = useState<number>(currentServings);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(0);

  // Parse all available units from serving size
  const parsedServings = parseAllServingSizes(food.serving_size, food.serving_size_grams);
  const currentUnitIndex = Math.min(selectedUnitIndex, Math.max(0, parsedServings.length - 1));
  const parsedServing = parsedServings[currentUnitIndex] || null;
  const customUnitLabel = parsedServing ? getUnitShortLabel(parsedServing.unit) : "";

  // Calculate the actual amount in a given unit based on current servings
  const getAmountInUnit = (unitIndex: number): number => {
    const ps = parsedServings[unitIndex];
    if (!ps || !food.serving_size_grams) {
      // Fallback: just multiply servings by the parsed amount
      return currentServings * (ps?.amount || 1);
    }
    // Convert servings to grams, then to the target unit
    const totalGrams = currentServings * food.serving_size_grams;
    const amountInUnit = totalGrams / ps.gramsPerUnit;
    // Round to reasonable precision
    return Math.round(amountInUnit * 100) / 100;
  };

  // Reset state when dialog opens with new food/servings
  useEffect(() => {
    if (open) {
      setUnit("serving");
      setAmount(currentServings);
      setSelectedUnitIndex(0);
    }
  }, [open, currentServings]);

  // Calculate the effective servings multiplier
  const getServingsMultiplier = (): number => {
    if (unit === "serving") {
      return amount;
    } else if (unit === "custom" && parsedServing && food.serving_size_grams) {
      const userGrams = amount * parsedServing.gramsPerUnit;
      return userGrams / food.serving_size_grams;
    } else if (unit === "custom" && parsedServing) {
      return amount / parsedServing.amount;
    }
    return amount;
  };

  const multiplier = getServingsMultiplier();

  const handleSave = () => {
    if (amount > 0) {
      onSave(multiplier);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[95vw]">
        <DialogHeader>
          <DialogTitle>Edit Amount</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Food info */}
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="font-medium">{food.name}</p>
            <p className="text-sm text-muted-foreground">
              1 serving = {food.serving_size}
            </p>
          </div>

          {/* Unit toggle */}
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={unit === "serving" ? "default" : "outline"}
              className="flex-1 min-w-[80px]"
              onClick={() => {
                setUnit("serving");
                setAmount(currentServings);
              }}
            >
              Servings
            </Button>
            {parsedServings.length > 0 ? (
              parsedServings.map((ps, index) => (
                <Button
                  key={ps.unit}
                  variant={unit === "custom" && currentUnitIndex === index ? "default" : "outline"}
                  className="flex-1 min-w-[80px]"
                  onClick={() => {
                    setUnit("custom");
                    setSelectedUnitIndex(index);
                    // Calculate the actual amount in this unit based on current servings
                    setAmount(getAmountInUnit(index));
                  }}
                >
                  {getUnitDisplayName(ps.unit)}
                </Button>
              ))
            ) : (
              <Button
                variant="outline"
                className="flex-1 min-w-[80px]"
                disabled
                title="Serving size must include a weight (e.g., '100g', '4 oz')"
              >
                Units
              </Button>
            )}
          </div>

          {/* Amount input */}
          <div>
            <label className="text-sm font-medium">
              {unit === "serving" ? "Number of servings" : `Amount (${customUnitLabel})`}
            </label>
            <div className="relative mt-1">
              <Input
                type="number"
                value={amount === 0 ? "" : amount}
                onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                min={0}
                step={unit === "serving" ? 0.25 : (parsedServing?.unit === 'g' || parsedServing?.unit === 'ml' ? 1 : 0.1)}
                className={unit === "custom" ? "pr-12" : ""}
                autoFocus
              />
              {unit === "custom" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {customUnitLabel}
                </span>
              )}
            </div>
          </div>

          {/* Calculated macros preview */}
          <div className="p-3 rounded-lg border bg-card">
            <p className="text-sm font-medium mb-2">Nutrition</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold">
                  {Math.round(food.calories * multiplier)}
                </p>
                <p className="text-xs text-muted-foreground">Calories</p>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {Math.round(food.protein * multiplier * 10) / 10}g
                </p>
                <p className="text-xs text-muted-foreground">Protein</p>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {Math.round(food.total_carbohydrates * multiplier * 10) / 10}g
                </p>
                <p className="text-xs text-muted-foreground">Carbs</p>
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {Math.round(food.total_fat * multiplier * 10) / 10}g
                </p>
                <p className="text-xs text-muted-foreground">Fat</p>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} className="w-full" disabled={amount <= 0}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
