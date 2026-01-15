import type { OFFProductResponse, OFFProduct, TransformedOFFFood } from "./types";

// Use US subdomain for US-focused products
const OFF_API_BASE = "https://us.openfoodfacts.org/api/v2";
const OFF_WORLD_API = "https://world.openfoodfacts.org/api/v2";

export interface BarcodeResult {
  found: boolean;
  food?: TransformedOFFFood;
  error?: string;
}

// Look up a product by barcode
export async function lookupBarcode(barcode: string): Promise<BarcodeResult> {
  // Clean barcode - remove any spaces or dashes
  const cleanBarcode = barcode.replace(/[\s-]/g, "");

  // Try US database first
  let response = await fetch(`${OFF_API_BASE}/product/${cleanBarcode}.json`, {
    headers: {
      "User-Agent": "HealthTracker/1.0 (https://github.com/health-tracker)",
    },
  });

  let data: OFFProductResponse = await response.json();

  // If not found in US, try world database
  if (data.status === 0) {
    response = await fetch(`${OFF_WORLD_API}/product/${cleanBarcode}.json`, {
      headers: {
        "User-Agent": "HealthTracker/1.0 (https://github.com/health-tracker)",
      },
    });
    data = await response.json();
  }

  if (data.status === 0 || !data.product) {
    return {
      found: false,
      error: "Product not found in database",
    };
  }

  try {
    const food = transformProduct(data.product, cleanBarcode);
    return { found: true, food };
  } catch (err) {
    return {
      found: false,
      error: err instanceof Error ? err.message : "Failed to parse product data",
    };
  }
}

// Transform Open Food Facts product to our format
function transformProduct(product: OFFProduct, barcode: string): TransformedOFFFood {
  const n = product.nutriments;

  // Get product name
  let name = product.product_name_en || product.product_name || "Unknown Product";

  // Add brand if available
  if (product.brands && !name.toLowerCase().includes(product.brands.toLowerCase())) {
    name = `${product.brands} ${name}`;
  }

  // Determine serving size
  let servingSize = "100g";
  let servingSizeGrams: number | null = 100;

  if (product.serving_size) {
    servingSize = product.serving_size;
    servingSizeGrams = product.serving_quantity || parseServingGrams(product.serving_size);
  }

  // Use per-serving values if available, otherwise per 100g
  const hasServingData = n["energy-kcal_serving"] !== undefined;

  let calories: number;
  let protein: number;
  let totalFat: number;
  let carbs: number;
  let saturatedFat: number | null;
  let fiber: number | null;
  let sugar: number | null;
  let sodium: number | null;

  if (hasServingData && servingSizeGrams !== 100) {
    // Use per-serving data
    calories = n["energy-kcal_serving"] ?? 0;
    protein = n.proteins_serving ?? 0;
    totalFat = n.fat_serving ?? 0;
    carbs = n.carbohydrates_serving ?? 0;
    saturatedFat = n["saturated-fat_serving"] ?? null;
    fiber = n.fiber_serving ?? null;
    sugar = n.sugars_serving ?? null;
    sodium = n.sodium_serving ? n.sodium_serving * 1000 : null; // Convert g to mg
  } else {
    // Use per 100g data - need to scale if serving size is different
    const scale = servingSizeGrams ? servingSizeGrams / 100 : 1;

    calories = Math.round((n["energy-kcal_100g"] ?? 0) * scale);
    protein = Math.round(((n.proteins_100g ?? 0) * scale) * 10) / 10;
    totalFat = Math.round(((n.fat_100g ?? 0) * scale) * 10) / 10;
    carbs = Math.round(((n.carbohydrates_100g ?? 0) * scale) * 10) / 10;
    saturatedFat = n["saturated-fat_100g"] ? Math.round((n["saturated-fat_100g"] * scale) * 10) / 10 : null;
    fiber = n.fiber_100g ? Math.round((n.fiber_100g * scale) * 10) / 10 : null;
    sugar = n.sugars_100g ? Math.round((n.sugars_100g * scale) * 10) / 10 : null;
    sodium = n.sodium_100g ? Math.round(n.sodium_100g * scale * 1000) : null; // Convert g to mg
  }

  return {
    name,
    serving_size: servingSize,
    serving_size_grams: servingSizeGrams,
    calories,
    protein,
    total_fat: totalFat,
    saturated_fat: saturatedFat,
    trans_fat: n["trans-fat_100g"] ?? null,
    polyunsaturated_fat: n["polyunsaturated-fat_100g"] ?? null,
    monounsaturated_fat: n["monounsaturated-fat_100g"] ?? null,
    sodium,
    total_carbohydrates: carbs,
    fiber,
    sugar,
    added_sugar: null, // OFF doesn't track added sugar separately
    vitamin_a: n["vitamin-a_100g"] ?? null,
    vitamin_c: n["vitamin-c_100g"] ?? null,
    vitamin_d: n["vitamin-d_100g"] ?? null,
    calcium: n.calcium_100g ?? null,
    iron: n.iron_100g ?? null,
    barcode,
    source: "openfoodfacts",
  };
}

// Parse serving size string to get grams
function parseServingGrams(servingSize: string): number | null {
  // Match patterns like "28g", "1 cup (240g)", "30 g", "100ml"
  const match = servingSize.match(/(\d+(?:\.\d+)?)\s*g(?:rams?)?/i);
  if (match) {
    return parseFloat(match[1]);
  }

  // Match ml (assume 1ml = 1g for liquids)
  const mlMatch = servingSize.match(/(\d+(?:\.\d+)?)\s*ml/i);
  if (mlMatch) {
    return parseFloat(mlMatch[1]);
  }

  return null;
}
