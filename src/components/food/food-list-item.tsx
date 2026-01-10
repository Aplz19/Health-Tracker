"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Food } from "@/lib/supabase/types";

interface FoodListItemProps {
  food: Food;
  onEdit?: (food: Food) => void;
  onDelete?: (id: string) => void;
}

export function FoodListItem({ food, onEdit, onDelete }: FoodListItemProps) {
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm truncate">{food.name}</h4>
          <p className="text-xs text-muted-foreground">{food.serving_size}</p>
          <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
            <span>{food.calories} cal</span>
            <span>{food.protein}g protein</span>
            <span>{food.total_carbohydrates}g carbs</span>
            <span>{food.total_fat}g fat</span>
          </div>
        </div>
        <div className="flex gap-1">
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
