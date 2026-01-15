// Open Food Facts API Types

export interface OFFProductResponse {
  code: string;
  status: 0 | 1; // 0 = not found, 1 = found
  status_verbose: string;
  product?: OFFProduct;
}

export interface OFFProduct {
  code: string;
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;

  // Nutriments per 100g
  nutriments: OFFNutriments;

  // Images
  image_url?: string;
  image_small_url?: string;

  // Categories
  categories?: string;
  categories_tags?: string[];

  // Countries
  countries?: string;
  countries_tags?: string[];
}

export interface OFFNutriments {
  // Energy
  "energy-kcal_100g"?: number;
  "energy-kcal_serving"?: number;

  // Macros per 100g
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;

  // Macros per serving
  proteins_serving?: number;
  fat_serving?: number;
  carbohydrates_serving?: number;

  // Fat breakdown
  "saturated-fat_100g"?: number;
  "saturated-fat_serving"?: number;
  "trans-fat_100g"?: number;
  "trans-fat_serving"?: number;
  "polyunsaturated-fat_100g"?: number;
  "monounsaturated-fat_100g"?: number;

  // Carb breakdown
  fiber_100g?: number;
  fiber_serving?: number;
  sugars_100g?: number;
  sugars_serving?: number;

  // Minerals
  sodium_100g?: number;
  sodium_serving?: number;
  calcium_100g?: number;
  iron_100g?: number;

  // Vitamins
  "vitamin-a_100g"?: number;
  "vitamin-c_100g"?: number;
  "vitamin-d_100g"?: number;
}

// Transformed food ready for our database
export interface TransformedOFFFood {
  name: string;
  serving_size: string;
  serving_size_grams: number | null;
  calories: number;
  protein: number;
  total_fat: number;
  saturated_fat: number | null;
  trans_fat: number | null;
  polyunsaturated_fat: number | null;
  monounsaturated_fat: number | null;
  sodium: number | null;
  total_carbohydrates: number;
  fiber: number | null;
  sugar: number | null;
  added_sugar: number | null;
  vitamin_a: number | null;
  vitamin_c: number | null;
  vitamin_d: number | null;
  calcium: number | null;
  iron: number | null;
  barcode: string;
  source: "openfoodfacts";
}
