"use client";

import { Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Food } from "@/lib/supabase/types";

interface FoodListItemProps<T extends Food = Food> {
  food: T;
  onEdit?: (food: T) => void;
  onDelete?: (id: string) => void;
  onSave?: (food: T) => void;
  isSaving?: boolean;
}

export function FoodListItem<T extends Food>({
  food,
  onEdit,
  onDelete,
  onSave,
  isSaving = false,
}: FoodListItemProps<T>) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm leading-snug break-words line-clamp-2">{food.name}</h4>
          <p className="text-xs text-muted-foreground">
            {[food.brand, food.variant_label, food.serving_size].filter(Boolean).join(" · ")}
          </p>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span>{food.calories} cal</span>
            <span>{food.protein}g protein</span>
            <span>{food.total_carbohydrates}g carbs</span>
            <span>{food.total_fat}g fat</span>
          </div>
        </div>
        <div className="flex gap-1">
          {onSave && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-amber-500"
              disabled={isSaving}
              title="Add to your food library"
              onClick={() => onSave(food)}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className="h-4 w-4" />
              )}
              <span className="sr-only">Add {food.name} to your food library</span>
            </Button>
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={() => onEdit(food)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(food.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
