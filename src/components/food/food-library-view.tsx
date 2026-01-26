"use client";

import { useState } from "react";
import { Plus, Search, Database, ScanBarcode, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FoodList } from "./food-list";
import { BarcodeScanner } from "./barcode-scanner";
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
  offFoods: TransformedOFFFood[];
  isOffLoading: boolean;
  offError: string | null;
  onAddExternalFood: (food: TransformedOFFFood) => Promise<void>;
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
  offFoods,
  isOffLoading,
  offError,
  onAddExternalFood,
}: FoodLibraryViewProps) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isAddingScanned, setIsAddingScanned] = useState(false);
  const [isAddingExternal, setIsAddingExternal] = useState<string | null>(null);

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

  const handleAddExternal = async (food: TransformedOFFFood) => {
    setIsAddingExternal(food.barcode);
    try {
      await onAddExternalFood(food);
    } catch (err) {
      console.error("Failed to add external food:", err);
    } finally {
      setIsAddingExternal(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b bg-background">
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => setScannerOpen(true)}
            className="h-9 w-9 shrink-0"
          >
            <ScanBarcode className="h-4 w-4" />
          </Button>
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

        {/* Open Food Facts Search Results */}
        {searchQuery && (
          <div className="p-4 space-y-2 border-t border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Globe className="h-3 w-3" />
              <span>Open Food Facts</span>
              {isOffLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>

            {offError && (
              <p className="text-xs text-destructive">{offError}</p>
            )}

            {!isOffLoading && !offError && offFoods.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No matches found in Open Food Facts.
              </p>
            )}

            {offFoods.map((food) => (
              <div
                key={food.barcode}
                className="rounded-lg border bg-card p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{food.name}</p>
                  <p className="text-xs text-muted-foreground">{food.serving_size}</p>
                  <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{food.calories} cal</span>
                    <span>{food.protein}g protein</span>
                    <span>{food.total_carbohydrates}g carbs</span>
                    <span>{food.total_fat}g fat</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddExternal(food)}
                  disabled={isAddingExternal === food.barcode}
                >
                  {isAddingExternal === food.barcode ? "Adding..." : "Add"}
                </Button>
              </div>
            ))}
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

      <div className="flex-shrink-0 p-4 border-t bg-background">
        <div className="flex gap-2">
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
            Create Custom
          </Button>
        </div>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onFoodFound={handleFoodFound}
      />
    </div>
  );
}
