"use client";

import { useState } from "react";
import { FoodLibraryView } from "./food-library-view";
import { AddFoodFormView } from "./add-food-form-view";
import { useFoods } from "@/hooks/use-foods";
import { cn } from "@/lib/utils";
import type { Food } from "@/lib/supabase/types";

type PanelView = "library" | "add-form";

export function FoodPanel() {
  const [currentView, setCurrentView] = useState<PanelView>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingFood, setEditingFood] = useState<Food | null>(null);

  const { foods, isLoading, addFood, updateFood, deleteFood } = useFoods(searchQuery);

  const showAddForm = () => {
    setEditingFood(null);
    setCurrentView("add-form");
  };

  const showEditForm = (food: Food) => {
    setEditingFood(food);
    setCurrentView("add-form");
  };

  const showLibrary = () => {
    setEditingFood(null);
    setCurrentView("library");
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
            onDeleteFood={deleteFood}
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
                await addFood(data);
              }
              showLibrary();
            }}
          />
        </div>
      </div>
    </div>
  );
}
