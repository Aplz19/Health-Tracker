"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddFoodForm } from "./add-food-form";
import type { Food, FoodInsert } from "@/lib/supabase/types";

interface AddFoodFormViewProps {
  editingFood: Food | null;
  onBack: () => void;
  onSubmit: (data: FoodInsert) => Promise<void>;
}

export function AddFoodFormView({ editingFood, onBack, onSubmit }: AddFoodFormViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-4 border-b bg-background">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="font-semibold">{editingFood ? "Edit Food" : "Add Food"}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AddFoodForm editingFood={editingFood} onSubmit={onSubmit} />
      </div>
    </div>
  );
}
