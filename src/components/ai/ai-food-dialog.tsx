'use client';

import { Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AIFoodLogger } from './ai-food-logger';
import type { Food } from '@/lib/supabase/types';

interface AIFoodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mealTitle: string;
  onSelectFood: (food: Food, servings: number) => void;
}

// Convert AI food match to Food type
interface FoodMatch {
  id: string;
  name: string;
  serving_size: string;
  serving_size_grams: number;
  calories: number;
  protein: number;
  total_fat: number;
  total_carbohydrates: number;
  similarity: number;
  brand?: string | null;
  variant_label?: string | null;
  source?: Food["source"];
}

// Unit conversion map (same as food-picker-dialog)
const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  oz: 28.35,
  ounce: 28.35,
  ounces: 28.35,
  lb: 453.6,
  lbs: 453.6,
  pound: 453.6,
  pounds: 453.6,
  kg: 1000,
  ml: 1,
  l: 1000,
  liter: 1000,
  liters: 1000,
  cup: 240, // approximation
  cups: 240,
  scoop: 30, // typical protein scoop
  scoops: 30,
  serving: 1, // special case
  servings: 1,
};

export function AIFoodDialog({
  open,
  onOpenChange,
  mealTitle,
  onSelectFood,
}: AIFoodDialogProps) {
  const handleFoodSelected = (
    foodMatch: FoodMatch,
    amount: number,
    unit: string,
  ) => {
    try {
      // Calculate servings based on amount and unit
      const servings = calculateServings(foodMatch, amount, unit);

      // Create a partial Food object with the data we have
      const food: Food = {
        id: foodMatch.id,
        name: foodMatch.name,
        serving_size: foodMatch.serving_size,
        serving_size_grams: foodMatch.serving_size_grams,
        calories: foodMatch.calories,
        protein: foodMatch.protein,
        total_fat: foodMatch.total_fat,
        total_carbohydrates: foodMatch.total_carbohydrates,
        // These will be filled in by the actual food data
        saturated_fat: null,
        trans_fat: null,
        polyunsaturated_fat: null,
        monounsaturated_fat: null,
        sodium: null,
        fiber: null,
        sugar: null,
        added_sugar: null,
        vitamin_a: null,
        vitamin_c: null,
        vitamin_d: null,
        calcium: null,
        iron: null,
        cholesterol: null,
        brand: foodMatch.brand ?? null,
        brand_slug: null,
        search_aliases: foodMatch.brand ? [foodMatch.brand.toLowerCase()] : [],
        source_category: null,
        variant_label: foodMatch.variant_label ?? null,
        fdc_id: null,
        barcode: null,
        source: foodMatch.source ?? 'manual',
        source_external_id: null,
        source_identity_key: null,
        content_hash: null,
        is_active: true,
        verified_at: null,
        supersedes_food_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      onSelectFood(food, servings);
      // Don't close dialog - let user continue with more foods or close manually
    } catch (error) {
      console.error('Error processing food selection:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Food Logger - {mealTitle}
          </DialogTitle>
        </DialogHeader>

        <AIFoodLogger
          onFoodSelected={handleFoodSelected}
        />

        <p className="text-xs text-muted-foreground text-center">
          Speak or type multiple foods at once
        </p>
      </DialogContent>
    </Dialog>
  );
}

// Calculate servings multiplier from amount and unit
function calculateServings(food: FoodMatch, amount: number, unit: string): number {
  const normalizedUnit = unit.toLowerCase().trim();

  // If unit is "serving", return amount directly
  if (normalizedUnit === 'serving' || normalizedUnit === 'servings') {
    return amount;
  }

  // If food has grams per serving, convert
  if (food.serving_size_grams && food.serving_size_grams > 0) {
    const gramsPerUnit = UNIT_TO_GRAMS[normalizedUnit];

    if (gramsPerUnit) {
      const totalGrams = amount * gramsPerUnit;
      return totalGrams / food.serving_size_grams;
    }
  }

  // Fallback: just return the amount as servings
  return amount;
}
