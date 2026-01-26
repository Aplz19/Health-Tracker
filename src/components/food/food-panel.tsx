"use client";

import { useEffect, useMemo, useState } from "react";
import { FoodLibraryView } from "./food-library-view";
import { AddFoodFormView } from "./add-food-form-view";
import { useUserFoodLibrary, type LibraryFood } from "@/hooks/use-user-food-library";
import { cn } from "@/lib/utils";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";
import { searchProducts } from "@/lib/openfoodfacts/client";

type PanelView = "library" | "add-form";

export function FoodPanel() {
  const [currentView, setCurrentView] = useState<PanelView>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingFood, setEditingFood] = useState<LibraryFood | null>(null);
  const [offFoods, setOffFoods] = useState<TransformedOFFFood[]>([]);
  const [isOffLoading, setIsOffLoading] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);

  const {
    foods,
    isLoading,
    addToLibrary,
    updateFood,
    removeFromLibrary,
  } = useUserFoodLibrary(searchQuery);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setOffFoods([]);
      setOffError(null);
      return;
    }

    const handler = setTimeout(async () => {
      setIsOffLoading(true);
      setOffError(null);
      try {
        const { foods: results } = await searchProducts(searchQuery, 12);
        setOffFoods(results);
      } catch (err) {
        setOffError(err instanceof Error ? err.message : "Failed to search Open Food Facts");
        setOffFoods([]);
      } finally {
        setIsOffLoading(false);
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  const filteredOffFoods = useMemo(() => {
    if (offFoods.length === 0) return [];
    const libraryBarcodes = new Set(
      foods
        .map((food) => food.barcode)
        .filter((barcode): barcode is string => Boolean(barcode))
    );

    return offFoods.filter((food) => !libraryBarcodes.has(food.barcode));
  }, [foods, offFoods]);

  const showAddForm = () => {
    setEditingFood(null);
    setCurrentView("add-form");
  };

  const showEditForm = (food: LibraryFood) => {
    setEditingFood(food);
    setCurrentView("add-form");
  };

  const showLibrary = () => {
    setEditingFood(null);
    setCurrentView("library");
  };

  const handleDeleteFood = async (libraryId: string) => {
    await removeFromLibrary(libraryId);
  };

  const handleAddScannedFood = async (food: TransformedOFFFood) => {
    // Map OFF food to FoodInsert format
    await addToLibrary({
      name: food.name,
      serving_size: food.serving_size,
      serving_size_grams: food.serving_size_grams,
      calories: food.calories,
      protein: food.protein,
      total_fat: food.total_fat,
      saturated_fat: food.saturated_fat,
      trans_fat: food.trans_fat,
      polyunsaturated_fat: food.polyunsaturated_fat,
      monounsaturated_fat: food.monounsaturated_fat,
      sodium: food.sodium,
      total_carbohydrates: food.total_carbohydrates,
      fiber: food.fiber,
      sugar: food.sugar,
      added_sugar: food.added_sugar,
      vitamin_a: food.vitamin_a,
      vitamin_c: food.vitamin_c,
      vitamin_d: food.vitamin_d,
      calcium: food.calcium,
      iron: food.iron,
      fdc_id: null,
      barcode: food.barcode,
      source: food.source,
    });
  };

  const handleAddExternalFood = async (food: TransformedOFFFood) => {
    await addToLibrary({
      name: food.name,
      serving_size: food.serving_size,
      serving_size_grams: food.serving_size_grams,
      calories: food.calories,
      protein: food.protein,
      total_fat: food.total_fat,
      saturated_fat: food.saturated_fat,
      trans_fat: food.trans_fat,
      polyunsaturated_fat: food.polyunsaturated_fat,
      monounsaturated_fat: food.monounsaturated_fat,
      sodium: food.sodium,
      total_carbohydrates: food.total_carbohydrates,
      fiber: food.fiber,
      sugar: food.sugar,
      added_sugar: food.added_sugar,
      vitamin_a: food.vitamin_a,
      vitamin_c: food.vitamin_c,
      vitamin_d: food.vitamin_d,
      calcium: food.calcium,
      iron: food.iron,
      fdc_id: null,
      barcode: food.barcode,
      source: food.source,
    });
  };

  return (
    <div className="relative overflow-hidden h-full">
      <div
        className={cn(
          "flex h-full transition-transform duration-300 ease-in-out",
          currentView === "add-form" && "-translate-x-1/2"
        )}
        style={{ width: "200%" }}
      >
        {/* Library View */}
        <div className="w-1/2 h-full">
          <FoodLibraryView
            foods={foods}
            isLoading={isLoading}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onAddFood={showAddForm}
            onEditFood={showEditForm}
            onDeleteFood={handleDeleteFood}
            onAddScannedFood={handleAddScannedFood}
            offFoods={filteredOffFoods}
            isOffLoading={isOffLoading}
            offError={offError}
            onAddExternalFood={handleAddExternalFood}
          />
        </div>

        {/* Add/Edit Form View */}
        <div className="w-1/2 h-full">
          <AddFoodFormView
            editingFood={editingFood}
            onBack={showLibrary}
            onSubmit={async (data) => {
              if (editingFood) {
                await updateFood(editingFood.id, data);
              } else {
                await addToLibrary(data);
              }
              showLibrary();
            }}
          />
        </div>
      </div>
    </div>
  );
}
