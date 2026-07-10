import { NextResponse } from "next/server";
import {
  ADMIN_NO_STORE_HEADERS,
  hasValidAdminBearerAuthorization,
} from "@/lib/admin/auth";
import {
  FOOD_EMBEDDING_BATCH_LIMIT,
  FOOD_EMBEDDING_UPDATE_CONCURRENCY,
  mapWithConcurrency,
  prepareFoodEmbeddingRows,
  summarizeFoodEmbeddingBackfill,
  type FoodEmbeddingBackfillResult,
  type FoodEmbeddingRow,
  type FoodEmbeddingUpdateOutcome,
} from "@/lib/embeddings/food-backfill";
import {
  FOOD_EMBEDDING_MODEL,
  generateEmbeddings,
} from "@/lib/embeddings/openai";
import { getRequiredServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FOOD_EMBEDDING_COLUMNS = [
  "id",
  "name",
  "brand",
  "brand_slug",
  "search_aliases",
  "variant_label",
  "source_category",
  "serving_size",
  "updated_at",
].join(",");

const STALE_EMBEDDING_FILTER = [
  "embedding.is.null",
  "embedding_model.is.null",
  `embedding_model.neq.${FOOD_EMBEDDING_MODEL}`,
  "embedding_input_hash.is.null",
  "embedding_updated_at.is.null",
].join(",");

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: ADMIN_NO_STORE_HEADERS },
  );
}

function resultResponse(result: FoodEmbeddingBackfillResult, status = 200) {
  return NextResponse.json(result, {
    status,
    headers: ADMIN_NO_STORE_HEADERS,
  });
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!cronSecret || !serviceRoleKey || !supabaseUrl || !openaiKey) {
    return errorResponse("Food embedding bridge is not configured", 503);
  }
  if (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    serviceRoleKey === process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return errorResponse("Food embedding bridge is not configured", 503);
  }
  if (!hasValidAdminBearerAuthorization(request.headers.get("authorization"), cronSecret)) {
    return errorResponse("Unauthorized", 401);
  }

  let supabase: ReturnType<typeof getRequiredServerSupabase>;
  try {
    supabase = getRequiredServerSupabase();
  } catch {
    return errorResponse("Food embedding bridge is not configured", 503);
  }

  let queryResult;
  try {
    queryResult = await supabase
      .from("foods")
      .select(FOOD_EMBEDDING_COLUMNS, { count: "exact" })
      .eq("is_active", true)
      .or(STALE_EMBEDDING_FILTER)
      .order("id", { ascending: true })
      .limit(FOOD_EMBEDDING_BATCH_LIMIT);
  } catch {
    return errorResponse("Food embedding query failed", 502);
  }
  const { data, error, count } = queryResult;

  if (error) return errorResponse("Food embedding query failed", 502);

  const foods = (data || []) as unknown as FoodEmbeddingRow[];
  if (foods.length === 0) {
    return resultResponse({
      scanned: 0,
      updated: 0,
      changed: 0,
      failed: 0,
      has_more: false,
    });
  }

  const prepared = prepareFoodEmbeddingRows(foods);
  let embeddings: number[][];
  try {
    // Exactly one OpenAI request per route call, containing at most 100 inputs.
    embeddings = await generateEmbeddings(prepared.map((item) => item.input));
  } catch {
    return resultResponse({
      scanned: prepared.length,
      updated: 0,
      changed: 0,
      failed: prepared.length,
      has_more: true,
    }, 502);
  }

  const outcomes = await mapWithConcurrency(
    prepared,
    FOOD_EMBEDDING_UPDATE_CONCURRENCY,
    async (item, index): Promise<FoodEmbeddingUpdateOutcome> => {
      try {
        const update = await supabase
          .from("foods")
          .update({
            embedding: embeddings[index],
            embedding_model: FOOD_EMBEDDING_MODEL,
            embedding_input_hash: item.inputHash,
            embedding_updated_at: new Date().toISOString(),
          })
          .eq("id", item.food.id)
          .eq("is_active", true)
          .eq("updated_at", item.food.updated_at)
          .select("id")
          .maybeSingle();

        if (update.error) return "failed";
        return update.data ? "updated" : "changed";
      } catch {
        return "failed";
      }
    },
  );

  return resultResponse(
    summarizeFoodEmbeddingBackfill(prepared.length, count, outcomes),
  );
}
