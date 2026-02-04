"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FoodPickerDialog } from "@/components/food/food-picker-dialog";
import type { Food, SavedMealPreset } from "@/lib/supabase/types";
import type { SavedMealPresetWithItems } from "@/hooks/use-saved-meal-presets";

interface PresetItem {
  id?: string;
  food: Food;
  servings: number;
}

interface CreatePresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPreset?: SavedMealPresetWithItems | null;
  onSave: (
    name: string,
    items: Array<{ foodId: string; servings: number }>,
    presetId?: string
  ) => Promise<void>;
}

export function CreatePresetDialog({
  open,
  onOpenChange,
  editingPreset,
  onSave,
}: CreatePresetDialogProps) {
  const [name, setName] = useState("");
  const [items, setItems] = useState<PresetItem[]>([]);
  const [isFoodPickerOpen, setIsFoodPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when dialog opens/closes or editing preset changes
  useEffect(() => {
    if (open) {
      if (editingPreset) {
        setName(editingPreset.name);
        setItems(
          editingPreset.items.map((item) => ({
            id: item.id,
            food: item.food,
            servings: item.servings,
          }))
        );
      } else {
        setName("");
        setItems([]);
      }
    }
  }, [open, editingPreset]);

  const handleAddFood = (food: Food, servings: number) => {
    // Check if food already exists
    const existingIndex = items.findIndex((item) => item.food.id === food.id);
    if (existingIndex >= 0) {
      // Update servings of existing item
      setItems((prev) =>
        prev.map((item, i) =>
          i === existingIndex
            ? { ...item, servings: item.servings + servings }
            : item
        )
      );
    } else {
      setItems((prev) => [...prev, { food, servings }]);
    }
    setIsFoodPickerOpen(false);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateServings = (index: number, servings: number) => {
    if (servings <= 0) return;
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, servings } : item))
    );
  };

  const handleSave = async () => {
    if (!name.trim() || items.length === 0) return;

    setIsSaving(true);
    try {
      await onSave(
        name.trim(),
        items.map((item) => ({ foodId: item.food.id, servings: item.servings })),
        editingPreset?.id
      );
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to save preset:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const totalCalories = items.reduce(
    (sum, item) => sum + item.food.calories * item.servings,
    0
  );
  const totalProtein = items.reduce(
    (sum, item) => sum + item.food.protein * item.servings,
    0
  );
  const totalCarbs = items.reduce(
    (sum, item) => sum + item.food.total_carbohydrates * item.servings,
    0
  );
  const totalFat = items.reduce(
    (sum, item) => sum + item.food.total_fat * item.servings,
    0
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl w-[95vw] max-h-[80vh] !grid-rows-[auto_1fr] overflow-hidden flex flex-col top-[10%] translate-y-0 sm:top-[50%] sm:-translate-y-1/2">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingPreset ? "Edit Saved Meal" : "Create Saved Meal"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Name input */}
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Breakfast Combo"
                className="mt-1"
                autoFocus
              />
            </div>

            {/* Items list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Foods</label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFoodPickerOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Food
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground border rounded-lg border-dashed">
                  No foods added yet
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((item, index) => (
                    <Card key={item.food.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{item.food.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(item.food.calories * item.servings)} cal |{" "}
                            {Math.round(item.food.protein * item.servings)}g P
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Input
                            type="number"
                            value={item.servings}
                            onChange={(e) =>
                              handleUpdateServings(index, Number(e.target.value))
                            }
                            min={0.25}
                            step={0.25}
                            className="w-20 h-8 text-center"
                          />
                          <span className="text-xs text-muted-foreground w-12">
                            servings
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="p-3 rounded-lg border bg-muted/30 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Total:</span>
                  <span>
                    {Math.round(totalCalories)} cal | {Math.round(totalProtein)}g P |{" "}
                    {Math.round(totalCarbs)}g C | {Math.round(totalFat)}g F
                  </span>
                </div>
              </div>
            )}

            {/* Save button */}
            <Button
              onClick={handleSave}
              disabled={!name.trim() || items.length === 0 || isSaving}
              className="w-full"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingPreset ? (
                "Update Saved Meal"
              ) : (
                "Create Saved Meal"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested food picker for adding foods to preset */}
      <FoodPickerDialog
        open={isFoodPickerOpen}
        onOpenChange={setIsFoodPickerOpen}
        mealTitle="Saved Meal"
        onSelectFood={handleAddFood}
        mode="food-only"
      />
    </>
  );
}
