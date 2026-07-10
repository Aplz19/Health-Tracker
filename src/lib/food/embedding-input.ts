export interface EmbeddableFood {
  name: string;
  brand?: string | null;
  brand_slug?: string | null;
  search_aliases?: string[] | null;
  variant_label?: string | null;
  source_category?: string | null;
  serving_size?: string | null;
}

/** One canonical representation for both online queries and offline backfills. */
export function createFoodEmbeddingInput(food: EmbeddableFood): string {
  return [
    food.brand,
    food.brand_slug?.replace(/-/g, " "),
    food.name,
    food.variant_label,
    food.source_category,
    ...(food.search_aliases || []),
    food.serving_size,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLocaleLowerCase("en-US");
}
