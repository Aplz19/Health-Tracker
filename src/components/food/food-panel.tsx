"use client";

import { useState } from "react";
import { FoodLibraryView } from "./food-library-view";
import { AddFoodFormView } from "./add-food-form-view";
import { useUserFoodLibrary, type LibraryFood } from "@/hooks/use-user-food-library";
import { cn } from "@/lib/utils";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

type PanelView = "library" | "add-form";

export function FoodPanel() {
  const [currentView, setCurrentView] = useState<PanelView>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingFood, setEditingFood] = useState<LibraryFood | null>(null);

  const {
    foods,
    isLoading,
    addToLibrary,
    updateFood,
    removeFromLibrary,
  } = useUserFoodLibrary(searchQuery);

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
