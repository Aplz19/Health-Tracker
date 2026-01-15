"use client";

import { useState } from "react";
import { Plus, Search, Database, ScanBarcode } from "lucide-react";
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
