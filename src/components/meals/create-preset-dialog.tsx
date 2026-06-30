"use client";

import { useState, useEffect } from "react";
import { Plus, Minus, X, Loader2 } from "lucide-react";
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
        <DialogContent fullscreenOnMobile className="text-left">
          {/* Sticky header (pr-12 keeps the title clear of the close button) */}
          <DialogHeader className="flex-shrink-0 border-b px-4 py-3 pr-12 text-left sm:px-6">
            <DialogTitle>
              {editingPreset ? "Edit Saved Meal" : "Create Saved Meal"}
            </DialogTitle>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
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

            {/* Foods header */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Foods</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFoodPickerOpen(true)}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Food
              </Button>
            </div>

            {/* Items list */}
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No foods added yet
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <Card key={item.food.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-snug break-words line-clamp-2">
                          {item.food.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {Math.round(item.food.calories * item.servings)} cal
                          {" · "}
                          {Math.round(item.food.protein * item.servings)}g P
                          {" · "}
                          {Math.round(item.food.total_carbohydrates * item.servings)}g C
                          {" · "}
                          {Math.round(item.food.total_fat * item.servings)}g F
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="-mr-1 -mt-1 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveItem(index)}
                        aria-label={`Remove ${item.food.name}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Touch-friendly servings stepper */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Servings</span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() =>
                            handleUpdateServings(
                              index,
                              Math.round((item.servings - 0.25) * 100) / 100
                            )
                          }
                          disabled={item.servings <= 0.25}
                          aria-label="Decrease servings"
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          value={item.servings}
                          onChange={(e) =>
                            handleUpdateServings(index, Number(e.target.value))
                          }
                          min={0.25}
                          step={0.25}
                          className="h-9 w-16 text-center"
                          aria-label="Servings"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() =>
                            handleUpdateServings(
                              index,
                              Math.round((item.servings + 0.25) * 100) / 100
                            )
                          }
                          aria-label="Increase servings"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Pinned footer: live totals + primary action (pb clears the iOS home bar) */}
          <div className="flex-shrink-0 space-y-3 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {items.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="font-medium">Total</span>
                <span className="text-muted-foreground">
                  {Math.round(totalCalories)} cal · {Math.round(totalProtein)}g P ·{" "}
                  {Math.round(totalCarbs)}g C · {Math.round(totalFat)}g F
                </span>
              </div>
            )}
            <Button
              onClick={handleSave}
              disabled={!name.trim() || items.length === 0 || isSaving}
              className="h-12 w-full text-base"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
