"use client";

import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FoodList } from "./food-list";
import type { Food } from "@/lib/supabase/types";

interface FoodLibraryViewProps {
  foods: Food[];
  isLoading: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddFood: () => void;
  onEditFood: (food: Food) => void;
  onDeleteFood: (id: string) => void;
}

export function FoodLibraryView({
  foods,
  isLoading,
  searchQuery,
  onSearchChange,
  onAddFood,
  onEditFood,
  onDeleteFood,
}: FoodLibraryViewProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 p-4 border-b bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search foods..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <FoodList
          foods={foods}
          isLoading={isLoading}
          onEdit={onEditFood}
          onDelete={onDeleteFood}
        />
      </div>

      <div className="flex-shrink-0 p-4 border-t bg-background">
        <Button onClick={onAddFood} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add New Food
        </Button>
      </div>
    </div>
  );
}
