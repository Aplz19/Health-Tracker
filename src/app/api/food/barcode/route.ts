import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { lookupBarcode, type BarcodeResult } from "@/lib/openfoodfacts/client";
import { normalizeFood } from "@/lib/food/client-food";
import { getRequestSupabase } from "@/lib/supabase/request";
import { getRequiredServerSupabase } from "@/lib/supabase/server";

// Cache transformed lookups. Note: on serverless this only persists within a
// warm instance — the durable cache is the `foods` table (see food DB plan).
const cache = new Map<string, { result: BarcodeResult; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
  const barcode = request.nextUrl.searchParams.get("barcode");

  if (!barcode) {
    return NextResponse.json(
      { found: false, error: "Barcode is required" },
      { status: 400 }
    );
  }

  const cleanBarcode = barcode.replace(/[\s-]/g, "");

  const cached = cache.get(cleanBarcode);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.result);
  }

  try {
    const result = await lookupBarcode(cleanBarcode);

    cache.set(cleanBarcode, { result, timestamp: Date.now() });

    // Evict stale entries once the cache grows large
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          cache.delete(key);
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Barcode lookup error:", error);
    return NextResponse.json(
      { found: false, error: "Failed to lookup barcode" },
      { status: 500 }
    );
  }
}

/** Re-fetch and persist a barcode server-side so clients cannot spoof catalog provenance. */
export async function POST(request: NextRequest) {
  const supabase = getRequestSupabase(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let barcode = "";
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && typeof (body as Record<string, unknown>).barcode === "string") {
      barcode = (body as Record<string, string>).barcode.replace(/[\s-]/g, "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json({ error: "Invalid barcode" }, { status: 400 });
  }

  let admin;
  try {
    admin = getRequiredServerSupabase();
  } catch {
    return NextResponse.json(
      { error: "Server-side barcode persistence is not configured" },
      { status: 503 }
    );
  }

  try {
    const lookup = await lookupBarcode(barcode);
    if (!lookup.found || !lookup.food) {
      return NextResponse.json({ error: lookup.error || "Product not found" }, { status: 404 });
    }

    const { data: existing } = await admin
      .from("foods")
      .select("*")
      .eq("source", "openfoodfacts")
      .eq("barcode", barcode)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let row = existing;
    if (!row) {
      const food = lookup.food;
      const legacyInput = {
        name: food.name,
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
        fdc_id: null,
        barcode,
        source: "openfoodfacts" as const,
      };
      const contentHash = createHash("sha256")
        .update(JSON.stringify(legacyInput))
        .digest("hex");
      const v2Input = {
        ...legacyInput,
        brand: food.brand,
        brand_slug: food.brand?.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || null,
        search_aliases: food.brand ? [food.brand.toLocaleLowerCase("en-US")] : [],
        cholesterol: null,
        source_external_id: barcode,
        source_identity_key: `openfoodfacts:${barcode}`,
        content_hash: contentHash,
        is_active: true,
        verified_at: new Date().toISOString(),
      };

      let insert = await admin.from("foods").insert(v2Input).select("*").single();
      if (insert.error?.code === "PGRST204" || insert.error?.code === "42703") {
        // Legacy schema compatibility before the staged catalog migration.
        insert = await admin.from("foods").insert(legacyInput).select("*").single();
      }
      if (insert.error) {
        if (insert.error.code === "23505") {
          const duplicate = await admin
            .from("foods")
            .select("*")
            .eq("source", "openfoodfacts")
            .eq("barcode", barcode)
            .limit(1)
            .single();
          if (duplicate.error) throw duplicate.error;
          row = duplicate.data;
        } else {
          throw insert.error;
        }
      } else {
        row = insert.data;
      }
    }

    const { error: libraryError } = await admin.from("user_food_library").upsert(
      { user_id: user.id, food_id: row.id },
      { onConflict: "user_id,food_id", ignoreDuplicates: true }
    );
    if (libraryError) throw libraryError;

    return NextResponse.json({ food: normalizeFood(row) });
  } catch (error) {
    console.error("Barcode persistence failed", error);
    return NextResponse.json({ error: "Could not save barcode food" }, { status: 502 });
  }
}
