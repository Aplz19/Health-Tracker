"use client";

import { useState, useEffect, useMemo } from "react";
import { Search, ArrowLeft, Database, Loader2, ScanBarcode } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserFoodLibrary, type LibraryFood } from "@/hooks/use-user-food-library";
import { BarcodeScanner } from "./barcode-scanner";
import type { Food } from "@/lib/supabase/types";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

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
  gramsPerUnit: number; // How many grams per 1 of this unit
}

// Weight/volume units and their conversion to grams (or ml for liquids)
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
  ml: 1, // Treat ml as grams (water density)
  l: 1000,
  liter: 1000,
  liters: 1000,
};

// Units we support for custom tracking (weight/volume only)
const TRACKABLE_UNITS = ['g', 'gram', 'grams', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds', 'kg', 'ml', 'l', 'liter', 'liters'];

// Normalize unit to canonical form (e.g., "grams" -> "g", "ounces" -> "oz")
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
  const foundUnits = new Set<string>(); // Track canonical units to avoid duplicates

  // Try to find all weight/volume units in the string
  // Patterns: "100g", "5 oz", "16 grams", "(16g)", "100 ml"
  for (const unit of TRACKABLE_UNITS) {
    // Match number followed by unit (with optional space)
    const regex = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}(?:\\s|\\)|$|,)`, 'i');
    const match = lowerServing.match(regex);
    if (match) {
      const canonicalUnit = normalizeUnit(unit);
      // Skip if we already found this unit type (e.g., don't add both "g" and "grams")
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

  // If no units found but we have serving_size_grams, offer grams option
  if (results.length === 0 && servingSizeGrams && servingSizeGrams > 0) {
    results.push({
      amount: servingSizeGrams,
      unit: 'g',
      gramsPerUnit: 1,
    });
    foundUnits.add('g');
  }

  // Auto-add complementary units for convenience
  // If we have grams but not ounces, add ounces
  if (foundUnits.has('g') && !foundUnits.has('oz')) {
    const gramsEntry = results.find(r => r.unit === 'g');
    if (gramsEntry) {
      const ozAmount = Math.round((gramsEntry.amount / 28.35) * 100) / 100;
      results.push({
        amount: ozAmount,
        unit: 'oz',
        gramsPerUnit: 28.35,
      });
    }
  }
  // If we have ounces but not grams, add grams
  if (foundUnits.has('oz') && !foundUnits.has('g')) {
    const ozEntry = results.find(r => r.unit === 'oz');
    if (ozEntry) {
      const gramsAmount = Math.round(ozEntry.amount * 28.35);
      results.push({
        amount: gramsAmount,
        unit: 'g',
        gramsPerUnit: 1,
      });
    }
  }
  // If we have ml but not grams, add grams (for liquids, roughly equivalent)
  if (foundUnits.has('ml') && !foundUnits.has('g')) {
    const mlEntry = results.find(r => r.unit === 'ml');
    if (mlEntry) {
      results.push({
        amount: mlEntry.amount,
        unit: 'g',
        gramsPerUnit: 1,
      });
    }
  }

  return results;
}

// Legacy function for backwards compatibility - returns first parsed unit
function parseServingSize(servingSize: string, servingSizeGrams: number | null): ParsedServing | null {
  const all = parseAllServingSizes(servingSize, servingSizeGrams);
  return all.length > 0 ? all[0] : null;
}

// Get display name for unit
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

// Get short unit label for display
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

interface FoodPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealTitle: string;
  onSelectFood: (food: Food, servings: number) => void;
}

// Type for selected food (could be local or scanned)
type SelectedFood = Food | TransformedOFFFood;

// Type guard to check if food is from Open Food Facts
function isScannedFood(food: SelectedFood): food is TransformedOFFFood {
  return "source" in food && food.source === "openfoodfacts";
}

export function FoodPickerDialog({
  open,
  onOpenChange,
  mealTitle,
  onSelectFood,
}: FoodPickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<SelectedFood | null>(null);
  const [unit, setUnit] = useState<UnitType>("serving");
  const [amount, setAmount] = useState<number>(1);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(0); // Which unit to use when multiple available
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  // User's personal food library
  const {
    foods: libraryFoods,
    isLoading: isLoadingLibrary,
    addToLibrary,
  } = useUserFoodLibrary(searchQuery);

  // Load recent food IDs on mount
  useEffect(() => {
    setRecentIds(getRecentFoodIds());
  }, []);

  // Sort library foods by recent usage
  const sortedLibraryFoods = useMemo(() => {
    if (recentIds.length === 0) return libraryFoods;

    return [...libraryFoods].sort((a, b) => {
      const aIndex = recentIds.indexOf(a.id);
      const bIndex = recentIds.indexOf(b.id);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
  }, [libraryFoods, recentIds]);

  const isLoading = isLoadingLibrary;

  // Handle scanned food from barcode
  const handleScannedFood = (food: TransformedOFFFood) => {
    setSelectedFood(food);
    setUnit("serving");
    setAmount(1);
    setSelectedUnitIndex(0);
    setScannerOpen(false);
  };

  // Parse all available units from serving size
  const parsedServings = selectedFood
    ? parseAllServingSizes(selectedFood.serving_size, selectedFood.serving_size_grams)
    : [];
  const canUseCustomUnit = parsedServings.length > 0;
  const hasMultipleUnits = parsedServings.length > 1;
  // Get the currently selected unit (clamped to valid index)
  const currentUnitIndex = Math.min(selectedUnitIndex, Math.max(0, parsedServings.length - 1));
  const parsedServing = parsedServings[currentUnitIndex] || null;
  const customUnitName = parsedServing ? getUnitDisplayName(parsedServing.unit) : "";
  const customUnitLabel = parsedServing ? getUnitShortLabel(parsedServing.unit) : "";

  // Calculate the effective servings multiplier
  const getServingsMultiplier = (): number => {
    if (unit === "serving") {
      return amount;
    } else if (unit === "custom" && parsedServing && selectedFood?.serving_size_grams) {
      // Convert user's amount to grams, then divide by serving grams
      const userGrams = amount * parsedServing.gramsPerUnit;
      return userGrams / selectedFood.serving_size_grams;
    } else if (unit === "custom" && parsedServing) {
      // Fallback: simple ratio based on parsed amount
      return amount / parsedServing.amount;
    }
    return amount;
  };

  const multiplier = getServingsMultiplier();

  const handleSelectFood = (food: SelectedFood) => {
    setSelectedFood(food);
    setUnit("serving");
    setAmount(1);
    setSelectedUnitIndex(0);
  };

  const handleBack = () => {
    setSelectedFood(null);
    setAmount(1);
    setUnit("serving");
    setSelectedUnitIndex(0);
  };

  const handleConfirm = async () => {
    if (!selectedFood || isSaving) return;

    let foodToAdd: Food;

    // If it's a scanned food, save to cache and add to user's library
    if (isScannedFood(selectedFood)) {
      setIsSaving(true);
      try {
        // Save to global cache AND user's library
        foodToAdd = await addToLibrary({
          name: selectedFood.name,
          serving_size: selectedFood.serving_size,
          serving_size_grams: selectedFood.serving_size_grams,
          calories: selectedFood.calories,
          protein: selectedFood.protein,
          total_fat: selectedFood.total_fat,
          saturated_fat: selectedFood.saturated_fat,
          trans_fat: selectedFood.trans_fat,
          polyunsaturated_fat: selectedFood.polyunsaturated_fat,
          monounsaturated_fat: selectedFood.monounsaturated_fat,
          sodium: selectedFood.sodium,
          total_carbohydrates: selectedFood.total_carbohydrates,
          fiber: selectedFood.fiber,
          sugar: selectedFood.sugar,
          added_sugar: selectedFood.added_sugar,
          vitamin_a: selectedFood.vitamin_a,
          vitamin_c: selectedFood.vitamin_c,
          vitamin_d: selectedFood.vitamin_d,
          calcium: selectedFood.calcium,
          iron: selectedFood.iron,
          fdc_id: null,
          barcode: selectedFood.barcode,
          source: selectedFood.source,
        });
      } catch (err) {
        console.error("Failed to save food:", err);
        setIsSaving(false);
        return;
      }
      setIsSaving(false);
    } else {
      foodToAdd = selectedFood;
    }

    // Track this food as recently used
    addRecentFoodId(foodToAdd.id);
    setRecentIds(getRecentFoodIds());

    onSelectFood(foodToAdd, multiplier);
    onOpenChange(false);
    setSearchQuery("");
    setSelectedFood(null);
    setAmount(1);
    setUnit("serving");
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSearchQuery("");
      setSelectedFood(null);
      setAmount(1);
      setUnit("serving");
      setSelectedUnitIndex(0);
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
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={unit === "serving" ? "default" : "outline"}
                className="flex-1 min-w-[80px]"
                onClick={() => {
                  setUnit("serving");
                  setAmount(1);
                }}
              >
                Servings
              </Button>
              {parsedServings.length > 0 ? (
                // Show a button for each available unit
                parsedServings.map((ps, index) => (
                  <Button
                    key={ps.unit}
                    variant={unit === "custom" && currentUnitIndex === index ? "default" : "outline"}
                    className="flex-1 min-w-[80px]"
                    onClick={() => {
                      setUnit("custom");
                      setSelectedUnitIndex(index);
                      setAmount(ps.amount);
                    }}
                  >
                    {getUnitDisplayName(ps.unit)}
                  </Button>
                ))
              ) : (
                // No units available - show disabled button
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

            <Button onClick={handleConfirm} className="w-full" disabled={amount <= 0 || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                `Add to ${mealTitle}`
              )}
            </Button>
          </div>
        ) : (
          // Food selection step
          <div className="flex flex-col min-h-0 overflow-hidden">
            <div className="flex gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your foods..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setScannerOpen(true)}
                className="h-10 w-10 shrink-0"
              >
                <ScanBarcode className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto mt-3">
              {isLoading && sortedLibraryFoods.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </div>
              ) : sortedLibraryFoods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    {searchQuery
                      ? "No foods found in your library"
                      : "Your food library is empty"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Scan a barcode or add foods from the Food Library
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pr-2">
                  {/* User's library foods */}
                  {sortedLibraryFoods.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                        <Database className="h-3 w-3" />
                        <span>Your Library</span>
                      </div>
                      {sortedLibraryFoods.map((food) => (
                        <Card
                          key={food.id}
                          className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSelectFood(food)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{food.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {food.serving_size}
                              </p>
                            </div>
                            <div className="text-right text-sm ml-2 shrink-0">
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
              )}
            </div>
          </div>
        )}
      </DialogContent>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onFoodFound={handleScannedFood}
      />
    </Dialog>
  );
}
