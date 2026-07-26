import type { FoodInsert } from "@/lib/supabase/types";
import type { TransformedOFFFood } from "./types";

/**
 * Map a scanned Open Food Facts product onto the shape `addToLibrary` expects.
 *
 * This mapping used to be duplicated inline at every scan call site (the food
 * library panel and the meal food picker), which made it easy for the two to
 * drift. Keep it here.
 */
export function offFoodToInsert(food: TransformedOFFFood): FoodInsert {
  return {
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
  } as FoodInsert;
}
