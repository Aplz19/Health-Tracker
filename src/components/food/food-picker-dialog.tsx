"use client";

import { useState, useMemo } from "react";
import { Search, ArrowLeft, Database, Globe2, Loader2, ScanBarcode, Plus, Star, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUserFoodLibrary, type LibraryFood } from "@/hooks/use-user-food-library";
import { useGlobalFoodSearch } from "@/hooks/use-global-food-search";
import {
  isSameFoodSearchQuery,
  normalizeFoodSearchQuery,
} from "@/lib/food/search-query";
import { useSavedMealPresets, type SavedMealPresetWithItems } from "@/hooks/use-saved-meal-presets";
import dynamic from "next/dynamic";
import { CreatePresetDialog } from "@/components/meals/create-preset-dialog";
import type { Food } from "@/lib/supabase/types";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

// Barcode scanner pulls in quagga2 (large); load it only when first opened.
const BarcodeScanner = dynamic(
  () => import("./barcode-scanner").then((m) => m.BarcodeScanner),
  { ssr: false }
);

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
  onSelectFood: (food: Food, servings: number) => void | Promise<void>;
  onSelectSavedMeal?: (preset: SavedMealPresetWithItems) => void | Promise<void>;
  mode?: "default" | "food-only"; // food-only hides saved meals tab (used when nested)
}

// Type for selected food (could be local or scanned)
type SelectedFood = Food | TransformedOFFFood;

// Type guard to check if food is from Open Food Facts
function isScannedFood(food: SelectedFood): food is TransformedOFFFood {
  return !("id" in food) && food.source === "openfoodfacts";
}

function FoodResultCard({
  food,
  onSelect,
  onSave,
  isSaving = false,
}: {
  food: Food;
  onSelect: (food: Food) => void;
  onSave?: (food: Food) => void;
  isSaving?: boolean;
}) {
  return (
    <Card
      className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onSelect(food)}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug break-words line-clamp-2">{food.name}</p>
          <p className="text-sm text-muted-foreground">
            {[food.brand, food.variant_label, food.serving_size].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex items-start gap-1 shrink-0">
          <div className="text-right text-sm">
            <p className="font-medium">{food.calories} cal</p>
            <p className="text-xs text-muted-foreground">
              {food.protein}P | {food.total_carbohydrates}C | {food.total_fat}F
            </p>
          </div>
          {onSave && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-amber-500"
              disabled={isSaving}
              title="Save to your food library"
              onClick={(event) => {
                event.stopPropagation();
                onSave(food);
              }}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function FoodSearchResults({
  libraryFoods,
  globalFoods,
  globalTotalCount,
  hasMoreGlobal,
  isLoadingLibrary,
  isSearchingGlobal,
  isLoadingMoreGlobal,
  globalError,
  searchQuery,
  searchedGlobally,
  savingGlobalId,
  onSelect,
  onSaveGlobal,
  onLoadMoreGlobal,
}: {
  libraryFoods: LibraryFood[];
  globalFoods: Food[];
  globalTotalCount: number | null;
  hasMoreGlobal: boolean;
  isLoadingLibrary: boolean;
  isSearchingGlobal: boolean;
  isLoadingMoreGlobal: boolean;
  globalError: string | null;
  searchQuery: string;
  searchedGlobally: boolean;
  savingGlobalId: string | null;
  onSelect: (food: Food) => void;
  onSaveGlobal: (food: Food) => void;
  onLoadMoreGlobal: () => void;
}) {
  const libraryIds = new Set(libraryFoods.map((food) => food.id));
  const distinctGlobal = globalFoods.filter((food) => !libraryIds.has(food.id));

  if (isLoadingLibrary && libraryFoods.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <p className="text-sm text-muted-foreground">Loading your foods...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pr-2">
      {libraryFoods.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Database className="h-3 w-3" />
            <span>Your Library ({libraryFoods.length})</span>
          </div>
          {libraryFoods.map((food) => (
            <FoodResultCard key={food.id} food={food} onSelect={onSelect} />
          ))}
        </section>
      )}

      {isSearchingGlobal && globalFoods.length === 0 && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
          <p className="text-sm text-muted-foreground">Searching all foods...</p>
        </div>
      )}

      {searchedGlobally && (!isSearchingGlobal || globalFoods.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Globe2 className="h-3 w-3" />
            <span>
              {globalTotalCount === null
                ? `Global results shown (${distinctGlobal.length})`
                : `Global results (${distinctGlobal.length} shown of ${globalTotalCount})`}
            </span>
            {isSearchingGlobal && (
              <span className="ml-auto flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing
              </span>
            )}
          </div>
          {distinctGlobal.length > 0 ? (
            <>
              {distinctGlobal.map((food) => (
                <FoodResultCard
                  key={food.id}
                  food={food}
                  onSelect={onSelect}
                  onSave={onSaveGlobal}
                  isSaving={savingGlobalId === food.id}
                />
              ))}
              {hasMoreGlobal && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={onLoadMoreGlobal}
                  disabled={isSearchingGlobal || isLoadingMoreGlobal}
                >
                  {isLoadingMoreGlobal && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isLoadingMoreGlobal ? "Loading more..." : "Load more"}
                </Button>
              )}
            </>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No additional global foods found.
            </p>
          )}
        </section>
      )}

      {globalError && (
        <p className="py-4 text-center text-sm text-destructive">{globalError}</p>
      )}

      {!searchQuery && libraryFoods.length === 0 && !isSearchingGlobal && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Your food library is empty.</p>
          <p className="text-xs text-muted-foreground mt-1">Scan a barcode or type a search.</p>
        </div>
      )}

      {searchQuery && !searchedGlobally && !isSearchingGlobal && (
        <div className="py-4 text-center">
          {libraryFoods.length === 0 && (
            <p className="text-sm text-muted-foreground">No match in your library.</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Press Enter or Search All for the global catalog.
          </p>
        </div>
      )}
    </div>
  );
}

export function FoodPickerDialog({
  open,
  onOpenChange,
  mealTitle,
  onSelectFood,
  onSelectSavedMeal,
  mode = "default",
}: FoodPickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<SelectedFood | null>(null);
  const [unit, setUnit] = useState<UnitType>("serving");
  const [amount, setAmount] = useState<number>(1);
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number>(0); // Which unit to use when multiple available
  const [recentIds, setRecentIds] = useState<string[]>(getRecentFoodIds);
  const [isSaving, setIsSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [savingGlobalId, setSavingGlobalId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"foods" | "saved">("foods");
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<SavedMealPresetWithItems | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // User's personal food library
  const {
    foods: libraryFoods,
    isLoading: isLoadingLibrary,
    addToLibrary,
    addExistingToLibrary,
  } = useUserFoodLibrary(searchQuery);
  const {
    foods: globalFoods,
    searchedQuery,
    totalCount: globalTotalCount,
    hasMore: hasMoreGlobal,
    isSearching: isSearchingGlobal,
    isLoadingMore: isLoadingMoreGlobal,
    error: globalError,
    searchGlobal,
    loadMore: loadMoreGlobal,
    clearGlobal,
  } = useGlobalFoodSearch();

  // Saved meal presets (only load if not in food-only mode)
  const {
    presets,
    isLoading: isLoadingPresets,
    savePreset,
    deletePreset,
  } = useSavedMealPresets();

  const recentIdLookup = useMemo(() => {
    if (recentIds.length === 0) return null;
    return new Map(recentIds.map((id, index) => [id, index]));
  }, [recentIds]);

  // Sort library foods by recent usage
  const sortedLibraryFoods = useMemo(() => {
    // Text relevance is authoritative while searching. Device-local recency is
    // useful only for the empty-query quick-pick list and must not overwrite the
    // shared ranker's exact/prefix ordering.
    if (normalizeFoodSearchQuery(searchQuery) || !recentIdLookup) return libraryFoods;

    return [...libraryFoods].sort((a, b) => {
      const aIndex = recentIdLookup.get(a.id);
      const bIndex = recentIdLookup.get(b.id);

      if (aIndex !== undefined && bIndex !== undefined) {
        return aIndex - bIndex;
      }
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return 0;
    });
  }, [libraryFoods, recentIdLookup, searchQuery]);

  const isLoading = isLoadingLibrary;

  const handleSearchQueryChange = (value: string) => {
    const meaningChanged = !isSameFoodSearchQuery(searchQuery, value);
    setSearchQuery(value);
    if (meaningChanged) clearGlobal();
  };

  const handleGlobalSearch = async () => {
    if (!normalizeFoodSearchQuery(searchQuery)) return;
    await searchGlobal(searchQuery);
  };

  const handleSaveGlobal = async (food: Food) => {
    if (savingGlobalId) return;
    setSavingGlobalId(food.id);
    setActionError(null);
    try {
      await addExistingToLibrary(food.id);
      // Keep paginated offsets stable after the personal-library exclusion set
      // changes. Cached rows paint immediately while page zero revalidates.
      if (searchedQuery) await searchGlobal(searchedQuery);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save food");
    } finally {
      setSavingGlobalId(null);
    }
  };

  // Handle scanned food from barcode
  const handleScannedFood = (food: TransformedOFFFood) => {
    setSelectedFood(food);
    setUnit("serving");
    setAmount(1);
    setSelectedUnitIndex(0);
    setScannerOpen(false);
  };

  // Parse all available units from serving size
  const parsedServings = useMemo(() => {
    if (!selectedFood) return [];
    return parseAllServingSizes(selectedFood.serving_size, selectedFood.serving_size_grams);
  }, [selectedFood]);
  // Get the currently selected unit (clamped to valid index)
  const currentUnitIndex = Math.min(selectedUnitIndex, Math.max(0, parsedServings.length - 1));
  const parsedServing = parsedServings[currentUnitIndex] || null;
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

    setIsSaving(true);
    setActionError(null);
    let foodToAdd: Food;

    // If it's a scanned food, save to cache and add to user's library
    try {
      if (isScannedFood(selectedFood)) {
        // Save to global cache AND user's library
        foodToAdd = await addToLibrary({
          name: selectedFood.name,
          brand: selectedFood.brand,
          brand_slug: null,
          search_aliases: selectedFood.brand ? [selectedFood.brand.toLowerCase()] : [],
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
          cholesterol: null,
          fdc_id: null,
          barcode: selectedFood.barcode,
          source: selectedFood.source,
          source_external_id: null,
          source_identity_key: null,
          content_hash: null,
          is_active: true,
          verified_at: null,
          supersedes_food_id: null,
          source_category: null,
          variant_label: null,
        });
      } else {
        foodToAdd = selectedFood;
      }

      await onSelectFood(foodToAdd, multiplier);

      // Track only a successfully logged food as recently used.
      addRecentFoodId(foodToAdd.id);
      setRecentIds(getRecentFoodIds());
      onOpenChange(false);
      setSearchQuery("");
      setSelectedFood(null);
      setAmount(1);
      setUnit("serving");
    } catch (error) {
      console.error("Failed to add food", error);
      setActionError(error instanceof Error ? error.message : "Could not add food");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setSearchQuery("");
      setSelectedFood(null);
      setAmount(1);
      setUnit("serving");
      setSelectedUnitIndex(0);
      setActiveTab("foods");
      clearGlobal();
    }
    onOpenChange(open);
  };

  const handleSelectSavedMeal = async (preset: SavedMealPresetWithItems) => {
    if (onSelectSavedMeal) {
      setIsSaving(true);
      setActionError(null);
      try {
        await onSelectSavedMeal(preset);
        onOpenChange(false);
        setActiveTab("foods");
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Could not add saved meal");
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSavePreset = async (
    name: string,
    items: Array<{ foodId: string; servings: number }>,
    presetId?: string
  ) => {
    await savePreset(name, items, presetId);
    setCreatePresetOpen(false);
    setEditingPreset(null);
  };

  const handleDeletePreset = async (presetId: string) => {
    await deletePreset(presetId);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent fullscreenOnMobile className="text-left">
        <DialogHeader className="flex-shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6">
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

        {actionError && (
          <p role="alert" className="mx-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:mx-6">
            {actionError}
          </p>
        )}

        {selectedFood ? (
          // Amount selection step
          <div className="flex-1 min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="font-medium">{selectedFood.name}</p>
              {selectedFood.brand && (
                <p className="text-sm text-muted-foreground">{selectedFood.brand}</p>
              )}
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
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && amount > 0 && !isSaving) {
                      handleConfirm();
                    }
                  }}
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
        ) : mode === "food-only" ? (
          // Food-only mode (no tabs, used when nested in create preset dialog)
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden px-4 py-4 sm:px-6">
            <div className="flex gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your library..."
                  value={searchQuery}
                  onChange={(e) => handleSearchQueryChange(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleGlobalSearch();
                    }
                  }}
                  enterKeyHint="search"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGlobalSearch}
                disabled={!searchQuery.trim() || isSearchingGlobal}
                className="h-10 shrink-0 px-3"
                title="Search all foods"
              >
                {isSearchingGlobal ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Globe2 className="h-4 w-4" />
                )}
                <span className="ml-1.5">All</span>
              </Button>
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
              <FoodSearchResults
                libraryFoods={sortedLibraryFoods}
                globalFoods={globalFoods}
                globalTotalCount={globalTotalCount}
                hasMoreGlobal={hasMoreGlobal}
                isLoadingLibrary={isLoading}
                isSearchingGlobal={isSearchingGlobal}
                isLoadingMoreGlobal={isLoadingMoreGlobal}
                globalError={globalError}
                searchQuery={searchQuery}
                searchedGlobally={Boolean(searchedQuery)}
                savingGlobalId={savingGlobalId}
                onSelect={handleSelectFood}
                onSaveGlobal={handleSaveGlobal}
                onLoadMoreGlobal={loadMoreGlobal}
              />
            </div>
          </div>
        ) : (
          // Default mode with tabs
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "foods" | "saved")} className="flex flex-1 min-h-0 flex-col overflow-hidden px-4 py-4 sm:px-6">
            <TabsList className="w-full flex-shrink-0">
              <TabsTrigger value="foods" className="flex-1">Foods</TabsTrigger>
              <TabsTrigger value="saved" className="flex-1">Saved Meals</TabsTrigger>
            </TabsList>

            <TabsContent value="foods" className="flex flex-col min-h-0 overflow-hidden mt-3">
              <div className="flex gap-2 flex-shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search your library..."
                    value={searchQuery}
                    onChange={(e) => handleSearchQueryChange(e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleGlobalSearch();
                      }
                    }}
                    enterKeyHint="search"
                    className="pl-9"
                    autoFocus={activeTab === "foods"}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGlobalSearch}
                  disabled={!searchQuery.trim() || isSearchingGlobal}
                  className="h-10 shrink-0 px-3"
                  title="Search all foods"
                >
                  {isSearchingGlobal ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe2 className="h-4 w-4" />
                  )}
                  <span className="ml-1.5">All</span>
                </Button>
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
                <FoodSearchResults
                  libraryFoods={sortedLibraryFoods}
                  globalFoods={globalFoods}
                  globalTotalCount={globalTotalCount}
                  hasMoreGlobal={hasMoreGlobal}
                  isLoadingLibrary={isLoading}
                  isSearchingGlobal={isSearchingGlobal}
                  isLoadingMoreGlobal={isLoadingMoreGlobal}
                  globalError={globalError}
                  searchQuery={searchQuery}
                  searchedGlobally={Boolean(searchedQuery)}
                  savingGlobalId={savingGlobalId}
                  onSelect={handleSelectFood}
                  onSaveGlobal={handleSaveGlobal}
                  onLoadMoreGlobal={loadMoreGlobal}
                />
              </div>
            </TabsContent>

            <TabsContent value="saved" className="flex flex-col min-h-0 overflow-hidden mt-3">
              <div className="flex justify-between items-center mb-3 flex-shrink-0">
                <p className="text-sm text-muted-foreground">
                  {presets.length} saved meal{presets.length !== 1 ? "s" : ""}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditingPreset(null);
                    setCreatePresetOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {isLoadingPresets ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  </div>
                ) : presets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      No saved meals yet
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Create a saved meal to quickly add multiple foods at once
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-2">
                    {presets.map((preset) => {
                      const totalCalories = preset.items.reduce(
                        (sum, item) => sum + item.food.calories * item.servings,
                        0
                      );
                      const totalProtein = preset.items.reduce(
                        (sum, item) => sum + item.food.protein * item.servings,
                        0
                      );
                      return (
                        <Card
                          key={preset.id}
                          className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleSelectSavedMeal(preset)}
                        >
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-snug break-words line-clamp-2">{preset.name}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {preset.items.length} food{preset.items.length !== 1 ? "s" : ""} |{" "}
                                {Math.round(totalCalories)} cal | {Math.round(totalProtein)}g P
                              </p>
                              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                                {preset.items.map((i) => i.food.name).join(", ")}
                              </p>
                            </div>
                            <div className="flex gap-1 ml-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPreset(preset);
                                  setCreatePresetOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeletePreset(preset.id);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>

      {scannerOpen && (
        <BarcodeScanner
          open
          onClose={() => setScannerOpen(false)}
          onFoodFound={handleScannedFood}
        />
      )}

      {mode === "default" && createPresetOpen && (
        <CreatePresetDialog
          open
          onOpenChange={setCreatePresetOpen}
          editingPreset={editingPreset}
          onSave={handleSavePreset}
        />
      )}
    </Dialog>
  );
}
