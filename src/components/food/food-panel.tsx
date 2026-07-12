"use client";

import { useState } from "react";
import { FoodLibraryView } from "./food-library-view";
import { AddFoodFormView } from "./add-food-form-view";
import { useUserFoodLibrary, type LibraryFood } from "@/hooks/use-user-food-library";
import { useGlobalFoodSearch } from "@/hooks/use-global-food-search";
import {
  isSameFoodSearchQuery,
  normalizeFoodSearchQuery,
} from "@/lib/food/search-query";
import { cn } from "@/lib/utils";
import type { Food } from "@/lib/supabase/types";
import type { TransformedOFFFood } from "@/lib/openfoodfacts/types";

type PanelView = "library" | "add-form";

export function FoodPanel() {
  const [currentView, setCurrentView] = useState<PanelView>("library");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingFood, setEditingFood] = useState<LibraryFood | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [savingGlobalId, setSavingGlobalId] = useState<string | null>(null);
  const [globalActionError, setGlobalActionError] = useState<string | null>(null);

  const {
    foods,
    isLoading,
    addToLibrary,
    addExistingToLibrary,
    updateFood,
    removeFromLibrary,
  } = useUserFoodLibrary(searchQuery);
  const {
    foods: globalFoods,
    searchedQuery,
    totalCount: globalTotalCount,
    hasMore: hasMoreGlobal,
    isSearching: isSearchingGlobal,
    isLoadingMore: isLoadingMoreGlobal,
    error: globalSearchError,
    searchGlobal,
    loadMore: loadMoreGlobal,
    clearGlobal,
  } = useGlobalFoodSearch();

  const handleSearchChange = (query: string) => {
    const meaningChanged = !isSameFoodSearchQuery(searchQuery, query);
    setSearchQuery(query);
    setGlobalActionError(null);
    if (meaningChanged) clearGlobal();
  };

  const handleSearchAll = async () => {
    if (!normalizeFoodSearchQuery(searchQuery)) return;
    await searchGlobal(searchQuery);
  };

  const handleSaveGlobal = async (food: Food) => {
    if (savingGlobalId) return;
    setSavingGlobalId(food.id);
    setGlobalActionError(null);
    try {
      await addExistingToLibrary(food.id);
      // v4 pages exclude personal-library rows. Refresh page zero after the
      // exclusion set changes so later offsets cannot skip a result.
      if (searchedQuery) await searchGlobal(searchedQuery);
    } catch (error) {
      setGlobalActionError(error instanceof Error ? error.message : "Could not save food");
    } finally {
      setSavingGlobalId(null);
    }
  };

  const showAddForm = () => {
    setEditingFood(null);
    setFormKey((key) => key + 1);
    setCurrentView("add-form");
  };

  const showEditForm = (food: LibraryFood) => {
    setEditingFood(food);
    setFormKey((key) => key + 1);
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
      brand: food.brand,
      brand_slug: null,
      search_aliases: food.brand ? [food.brand.toLowerCase()] : [],
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
      cholesterol: null,
      fdc_id: null,
      barcode: food.barcode,
      source: food.source,
      source_external_id: null,
      source_identity_key: null,
      content_hash: null,
      is_active: true,
      verified_at: null,
      supersedes_food_id: null,
      source_category: null,
      variant_label: null,
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
            globalFoods={globalFoods}
            globalTotalCount={globalTotalCount}
            hasMoreGlobal={hasMoreGlobal}
            isLoading={isLoading}
            isSearchingGlobal={isSearchingGlobal}
            isLoadingMoreGlobal={isLoadingMoreGlobal}
            searchedGlobally={Boolean(searchedQuery)}
            globalError={globalActionError ?? globalSearchError}
            savingGlobalId={savingGlobalId}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            onSearchAll={handleSearchAll}
            onLoadMoreGlobal={loadMoreGlobal}
            onSaveGlobal={handleSaveGlobal}
            onAddFood={showAddForm}
            onEditFood={showEditForm}
            onDeleteFood={handleDeleteFood}
            onAddScannedFood={handleAddScannedFood}
          />
        </div>

        {/* Add/Edit Form View */}
        <div className="w-1/2 h-full">
          <AddFoodFormView
            key={formKey}
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
