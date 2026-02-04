"use client";

import { useState } from "react";
import { Plus, Search, Database, ScanBarcode, Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FoodList } from "./food-list";
import { BarcodeScanner } from "./barcode-scanner";
import { CreatePresetDialog } from "@/components/meals/create-preset-dialog";
import { useSavedMealPresets, type SavedMealPresetWithItems } from "@/hooks/use-saved-meal-presets";
import type { LibraryFood } from "@/hooks/use-user-food-library";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

interface FoodLibraryViewProps {
  foods: LibraryFood[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddFood: () => void;
  onEditFood: (food: LibraryFood) => void;
  onDeleteFood: (libraryId: string) => void;
  onAddScannedFood: (food: TransformedOFFFood) => Promise<void>;
}

export function FoodLibraryView({
  foods,
  isLoading,
  searchQuery,
  onSearchChange,
  onAddFood,
  onEditFood,
  onDeleteFood,
  onAddScannedFood,
}: FoodLibraryViewProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isAddingScanned, setIsAddingScanned] = useState(false);
  const [activeTab, setActiveTab] = useState<"foods" | "meals">("foods");
  const [createPresetOpen, setCreatePresetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<SavedMealPresetWithItems | null>(null);

  // Saved meal presets
  const {
    presets,
    isLoading: isLoadingPresets,
    createPreset,
    updatePreset,
    deletePreset,
    addItemToPreset,
    removeItemFromPreset,
  } = useSavedMealPresets();

  const handleFoodFound = async (food: TransformedOFFFood) => {
    setIsAddingScanned(true);
    try {
      await onAddScannedFood(food);
    } catch (err) {
      console.error("Failed to add scanned food:", err);
    } finally {
      setIsAddingScanned(false);
    }
  };

  const handleSavePreset = async (
    name: string,
    items: Array<{ foodId: string; servings: number }>,
    presetId?: string
  ) => {
    if (presetId) {
      await updatePreset(presetId, name);
      const existingPreset = presets.find((p) => p.id === presetId);
      if (existingPreset) {
        for (const item of existingPreset.items) {
          await removeItemFromPreset(item.id);
        }
      }
      for (const item of items) {
        await addItemToPreset(presetId, item.foodId, item.servings);
      }
    } else {
      const newPreset = await createPreset(name);
      for (const item of items) {
        await addItemToPreset(newPreset.id, item.foodId, item.servings);
      }
    }
    setCreatePresetOpen(false);
    setEditingPreset(null);
  };

  const handleDeletePreset = async (presetId: string) => {
    await deletePreset(presetId);
  };

  return (
    <div className="flex flex-col h-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "foods" | "meals")} className="flex flex-col h-full">
        {/* Tabs header */}
        <div className="flex-shrink-0 p-4 pb-4 border-b bg-background">
          <TabsList className="w-full">
            <TabsTrigger
              value="foods"
              className="flex-1 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
            >
              Foods
            </TabsTrigger>
            <TabsTrigger
              value="meals"
              className="flex-1 data-[state=active]:bg-purple-600 data-[state=active]:text-white"
            >
              Meals
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Foods Tab */}
        <TabsContent value="foods" className="flex-1 flex flex-col min-h-0 mt-0">
          {/* Action buttons at top */}
          <div className="flex-shrink-0 p-4 border-b bg-background">
            <div className="flex gap-2 mb-3">
              <Button
                variant="outline"
                onClick={() => setScannerOpen(true)}
                className="flex-1"
                disabled={isAddingScanned}
              >
                <ScanBarcode className="h-4 w-4 mr-2" />
                Scan Barcode
              </Button>
              <Button onClick={onAddFood} className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Create Food
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search your foods..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* User's Library Foods */}
            {foods.length > 0 && (
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-3 w-3" />
                  <span>Your Food Library</span>
                </div>
                <FoodList
                  foods={foods}
                  isLoading={isLoading}
                  onEdit={onEditFood}
                  onDelete={(id) => {
                    const food = foods.find((f) => f.id === id);
                    if (food) onDeleteFood(food.library_id);
                  }}
                />
              </div>
            )}

            {/* Empty state for library */}
            {!isLoading && foods.length === 0 && !searchQuery && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <p>Your food library is empty.</p>
                <p className="mt-1">Scan a barcode or create a custom food!</p>
              </div>
            )}

            {/* No results in library */}
            {!isLoading && foods.length === 0 && searchQuery && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <p>No foods found for "{searchQuery}"</p>
                <p className="mt-1">Try a different search or scan a barcode.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Meals Tab */}
        <TabsContent value="meals" className="flex-1 flex flex-col min-h-0 mt-0">
          {/* Create meal button at top */}
          <div className="flex-shrink-0 p-4 border-b bg-background">
            <Button
              onClick={() => {
                setEditingPreset(null);
                setCreatePresetOpen(true);
              }}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Meal
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoadingPresets ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : presets.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <p>No saved meals yet.</p>
                <p className="mt-1">Create a meal to quickly add multiple foods at once!</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Database className="h-3 w-3" />
                  <span>Your Saved Meals ({presets.length})</span>
                </div>
                <div className="space-y-2">
                  {presets.map((preset) => {
                    const totalCalories = preset.items.reduce(
                      (sum, item) => sum + item.food.calories * item.servings,
                      0
                    );
                    const totalProtein = preset.items.reduce(
                      (sum, item) => sum + item.food.protein * item.servings,
                      0
                    );
                    const totalCarbs = preset.items.reduce(
                      (sum, item) => sum + item.food.total_carbohydrates * item.servings,
                      0
                    );
                    const totalFat = preset.items.reduce(
                      (sum, item) => sum + item.food.total_fat * item.servings,
                      0
                    );
                    return (
                      <Card key={preset.id} className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{preset.name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {preset.items.length} food{preset.items.length !== 1 ? "s" : ""} |{" "}
                              {Math.round(totalCalories)} cal
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {Math.round(totalProtein)}g P | {Math.round(totalCarbs)}g C | {Math.round(totalFat)}g F
                            </p>
                            <p className="text-xs text-muted-foreground truncate mt-1">
                              {preset.items.map((i) => i.food.name).join(", ")}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                setEditingPreset(preset);
                                setCreatePresetOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeletePreset(preset.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onFoodFound={handleFoodFound}
      />

      <CreatePresetDialog
        open={createPresetOpen}
        onOpenChange={setCreatePresetOpen}
        editingPreset={editingPreset}
        onSave={handleSavePreset}
      />
    </div>
  );
}
