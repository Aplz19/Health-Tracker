import type { Food, FoodSource } from "@/lib/supabase/types";

// Keep browser food queries explicit so the 1,536-dimension embedding column
// can never be transferred accidentally. These are the legacy-safe columns
// currently present in production; newer restaurant metadata is supplied by
// the versioned search RPC/API and normalized below when available.
export const FOOD_CLIENT_COLUMNS = [
  "id",
  "name",
  "serving_size",
  "serving_size_grams",
  "calories",
  "protein",
  "total_fat",
  "saturated_fat",
  "trans_fat",
  "polyunsaturated_fat",
  "monounsaturated_fat",
  "sodium",
  "total_carbohydrates",
  "fiber",
  "sugar",
  "added_sugar",
  "vitamin_a",
  "vitamin_c",
  "vitamin_d",
  "calcium",
  "iron",
  "fdc_id",
  "barcode",
  "source",
  "created_at",
  "updated_at",
].join(", ");

// Available after the staged restaurant/search migration. Use this only after
// a v2 RPC succeeds; legacy production does not have these columns yet.
export const FOOD_CLIENT_V2_COLUMNS = [
  FOOD_CLIENT_COLUMNS,
  "brand",
  "brand_slug",
  "search_aliases",
  "source_category",
  "variant_label",
  "cholesterol",
  "source_external_id",
  "source_identity_key",
  "content_hash",
  "is_active",
  "verified_at",
  "supersedes_food_id",
].join(", ");

const FOOD_SOURCES = new Set<FoodSource>([
  "manual",
  "usda",
  "openfoodfacts",
  "restaurant_official",
]);

type UnknownFoodRow = Partial<Food> & {
  id: string;
  name: string;
  serving_size: string;
};

/** Normalize legacy and current database rows to one stable UI contract. */
export function normalizeFood(row: UnknownFoodRow): Food {
  const source = FOOD_SOURCES.has(row.source as FoodSource)
    ? (row.source as FoodSource)
    : "manual";

  return {
    id: row.id,
    name: row.name,
    serving_size: row.serving_size,
    serving_size_grams: row.serving_size_grams ?? null,
    calories: row.calories ?? 0,
    protein: row.protein ?? 0,
    total_fat: row.total_fat ?? 0,
    saturated_fat: row.saturated_fat ?? null,
    trans_fat: row.trans_fat ?? null,
    polyunsaturated_fat: row.polyunsaturated_fat ?? null,
    monounsaturated_fat: row.monounsaturated_fat ?? null,
    sodium: row.sodium ?? null,
    total_carbohydrates: row.total_carbohydrates ?? 0,
    fiber: row.fiber ?? null,
    sugar: row.sugar ?? null,
    added_sugar: row.added_sugar ?? null,
    vitamin_a: row.vitamin_a ?? null,
    vitamin_c: row.vitamin_c ?? null,
    vitamin_d: row.vitamin_d ?? null,
    calcium: row.calcium ?? null,
    iron: row.iron ?? null,
    cholesterol: row.cholesterol ?? null,
    brand: row.brand ?? null,
    brand_slug: row.brand_slug ?? null,
    search_aliases: row.search_aliases ?? [],
    source_category: row.source_category ?? null,
    variant_label: row.variant_label ?? null,
    fdc_id: row.fdc_id ?? null,
    barcode: row.barcode ?? null,
    source,
    source_external_id: row.source_external_id ?? null,
    source_identity_key: row.source_identity_key ?? null,
    content_hash: row.content_hash ?? null,
    is_active: row.is_active ?? true,
    verified_at: row.verified_at ?? null,
    supersedes_food_id: row.supersedes_food_id ?? null,
    created_at: row.created_at ?? "",
    updated_at: row.updated_at ?? "",
  };
}
