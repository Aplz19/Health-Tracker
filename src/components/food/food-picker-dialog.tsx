"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, ArrowLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useFoods } from "@/hooks/use-foods";
import type { Food } from "@/lib/supabase/types";

const RECENT_FOODS_KEY = "health-tracker-recent-foods";
const MAX_RECENT_FOODS = 50;

// Get recently used food IDs from localStorage
function getRecentFoodIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(RECENT_FOODS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Add a food ID to the recent list (moves to front if already exists)
function addRecentFoodId(foodId: string): void {
  if (typeof window === "undefined") return;
  try {
    const recent = getRecentFoodIds().filter((id) => id !== foodId);
    recent.unshift(foodId);
    localStorage.setItem(
      RECENT_FOODS_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT_FOODS))
    );
  } catch {
    // Ignore localStorage errors
  }
}

interface ParsedServing {
  amount: number;
  unit: string;
}

// Parse serving size to extract amount and unit (e.g., "250g" → {amount: 250, unit: "g"})
function parseServingSize(servingSize: string): ParsedServing | null {
  // Match patterns like "250g", "100 grams", "1 cup", "2 oz", "1.5 tbsp", "100ml"
  const match = servingSize.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)/);
  if (match) {
    return {
      amount: parseFloat(match[1]),
      unit: match[2].toLowerCase(),
    };
  }
  return null;
}

// Get display name for unit
function getUnitDisplayName(unit: string): string {
  const unitNames: Record<string, string> = {
    g: "Grams",
    grams: "Grams",
    gram: "Grams",
    oz: "Ounces",
    ounce: "Ounces",
    ounces: "Ounces",
    cup: "Cups",
    cups: "Cups",
    tbsp: "Tablespoons",
    tablespoon: "Tablespoons",
    tablespoons: "Tablespoons",
    tsp: "Teaspoons",
    teaspoon: "Teaspoons",
    teaspoons: "Teaspoons",
    ml: "Milliliters",
    l: "Liters",
    lb: "Pounds",
    lbs: "Pounds",
    pound: "Pounds",
    pounds: "Pounds",
    slice: "Slices",
    slices: "Slices",
    piece: "Pieces",
    pieces: "Pieces",
    scoop: "Scoops",
    scoops: "Scoops",
  };
  return unitNames[unit] || unit.charAt(0).toUpperCase() + unit.slice(1);
}

type UnitType = "serving" | "custom";

interface FoodPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealTitle: string;
  onSelectFood: (food: Food, servings: number) => void;
}

export function FoodPickerDialog({
  open,
  onOpenChange,
  mealTitle,
  onSelectFood,
}: FoodPickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [unit, setUnit] = useState<UnitType>("serving");
  const [amount, setAmount] = useState<number>(1);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const { foods, isLoading } = useFoods(searchQuery);

  // Load recent food IDs on mount
  useEffect(() => {
    setRecentIds(getRecentFoodIds());
  }, []);

  // Sort foods by recent usage
  const sortedFoods = useMemo(() => {
    if (recentIds.length === 0) return foods;

    return [...foods].sort((a, b) => {
      const aIndex = recentIds.indexOf(a.id);
      const bIndex = recentIds.indexOf(b.id);

      // If both are in recent list, sort by recency
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only a is in recent list, a comes first
      if (aIndex !== -1) return -1;
      // If only b is in recent list, b comes first
      if (bIndex !== -1) return 1;
      // Neither in recent list, keep original order
      return 0;
    });
  }, [foods, recentIds]);

  const parsedServing = selectedFood ? parseServingSize(selectedFood.serving_size) : null;
  const canUseCustomUnit = parsedServing !== null;
  const customUnitName = parsedServing ? getUnitDisplayName(parsedServing.unit) : "";

  // Calculate the effective servings multiplier
  const getServingsMultiplier = (): number => {
    if (unit === "serving") {
      return amount;
    } else if (unit === "custom" && parsedServing) {
      return amount / parsedServing.amount;
    }
    return amount;
  };

  const multiplier = getServingsMultiplier();

  const handleSelectFood = (food: Food) => {
    setSelectedFood(food);
    setUnit("serving");
    setAmount(1);
  };

  const handleBack = () => {
    setSelectedFood(null);
    setAmount(1);
    setUnit("serving");
  };

  const handleConfirm = () => {
    if (selectedFood) {
      // Track this food as recently used
      addRecentFoodId(selectedFood.id);
      setRecentIds(getRecentFoodIds());

      onSelectFood(selectedFood, multiplier);
      onOpenChange(false);
      setSearchQuery("");
      setSelectedFood(null);
      setAmount(1);
      setUnit("serving");
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSearchQuery("");
      setSelectedFood(null);
      setAmount(1);
      setUnit("serving");
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl w-[95vw] max-h-[80vh] !grid-rows-[auto_1fr] overflow-hidden flex flex-col top-[10%] translate-y-0 sm:top-[50%] sm:-translate-y-1/2">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {selectedFood ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-2"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span>Add to {mealTitle}</span>
              </div>
            ) : (
              `Add to ${mealTitle}`
            )}
          </DialogTitle>
        </DialogHeader>

        {selectedFood ? (
          // Amount selection step
          <div className="space-y-4 overflow-y-auto">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">{selectedFood.name}</p>
              <p className="text-sm text-muted-foreground">
                1 serving = {selectedFood.serving_size}
              </p>
            </div>

            {/* Unit toggle */}
            <div className="flex gap-2">
              <Button
                variant={unit === "serving" ? "default" : "outline"}
                className="flex-1"
                onClick={() => {
                  setUnit("serving");
                  setAmount(1);
                }}
              >
                Servings
              </Button>
              <Button
                variant={unit === "custom" ? "default" : "outline"}
                className="flex-1"
                onClick={() => {
                  setUnit("custom");
                  setAmount(parsedServing?.amount || 1);
                }}
                disabled={!canUseCustomUnit}
                title={!canUseCustomUnit ? "Serving size must start with a number (e.g., '100g', '1 cup')" : ""}
              >
                {customUnitName || "Units"}
              </Button>
            </div>

            {/* Amount input */}
            <div>
              <label className="text-sm font-medium">
                {unit === "serving" ? "Number of servings" : customUnitName}
              </label>
              <Input
                type="number"
                value={amount === 0 ? "" : amount}
                onChange={(e) => setAmount(e.target.value === "" ? 0 : Number(e.target.value))}
                min={0}
                step={unit === "serving" ? 0.25 : 1}
                className="mt-1"
                autoFocus
              />
            </div>

            {/* Calculated macros preview */}
            <div className="p-3 rounded-lg border bg-card">
              <p className="text-sm font-medium mb-2">Nutrition</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold">
                    {Math.round(selectedFood.calories * multiplier)}
                  </p>
                  <p className="text-xs text-muted-foreground">Calories</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">
                    {Math.round(selectedFood.protein * multiplier * 10) / 10}g
                  </p>
                  <p className="text-xs text-muted-foreground">Protein</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">
                    {Math.round(selectedFood.total_carbohydrates * multiplier * 10) / 10}g
                  </p>
                  <p className="text-xs text-muted-foreground">Carbs</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">
                    {Math.round(selectedFood.total_fat * multiplier * 10) / 10}g
                  </p>
                  <p className="text-xs text-muted-foreground">Fat</p>
                </div>
              </div>
            </div>

            <Button onClick={handleConfirm} className="w-full" disabled={amount <= 0}>
              Add to {mealTitle}
            </Button>
          </div>
        ) : (
          // Food selection step
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="relative flex-shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search your foods..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto mt-3">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : sortedFoods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "No foods found"
                      : "No foods in your library yet."}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {!searchQuery && "Add foods from the menu to get started!"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pr-2">
                  {sortedFoods.map((food) => (
                    <Card
                      key={food.id}
                      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleSelectFood(food)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{food.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {food.serving_size}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium">{food.calories} cal</p>
                          <p className="text-xs text-muted-foreground">
                            {food.protein}P | {food.total_carbohydrates}C | {food.total_fat}F
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
