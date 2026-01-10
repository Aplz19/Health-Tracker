"use client";

import { FoodListItem } from "./food-list-item";
import type { Food } from "@/lib/supabase/types";

interface FoodListProps {
  foods: Food[];
  isLoading: boolean;
  onEdit?: (food: Food) => void;
  onDelete?: (id: string) => void;
}

export function FoodList({ foods, isLoading, onEdit, onDelete }: FoodListProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Loading foods...
      </div>
    );
  }

  if (foods.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        <p>No foods yet.</p>
        <p className="mt-1">Add your first food to get started!</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {foods.map((food) => (
        <FoodListItem key={food.id} food={food} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </div>
  );
}
