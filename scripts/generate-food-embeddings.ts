/**
 * Paginated, restart-safe embedding backfill for active foods.
 *
 * Prerequisites:
 * 1. Apply sql/add_food_search_v2.sql in Supabase.
 * 2. Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 *    OPENAI_API_KEY in .env.local.
 * 3. Run: npm run generate-embeddings
 *
 * Optional environment tuning:
 * FOOD_EMBEDDING_PAGE_SIZE=500
 * FOOD_EMBEDDING_BATCH_SIZE=64
 * FOOD_EMBEDDING_UPDATE_CONCURRENCY=10
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  FOOD_EMBEDDING_MODEL,
  generateEmbeddings,
} from "../src/lib/embeddings/openai";
import {
  createFoodEmbeddingInput,
  type EmbeddableFood,
} from "../src/lib/food/embedding-input";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  console.error("Missing required environment variables:");
  console.error("- NEXT_PUBLIC_SUPABASE_URL");
  console.error("- SUPABASE_SERVICE_ROLE_KEY");
  console.error("- OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = readPositiveInteger("FOOD_EMBEDDING_PAGE_SIZE", 500, 1_000);
const EMBEDDING_BATCH_SIZE = readPositiveInteger(
  "FOOD_EMBEDDING_BATCH_SIZE",
  64,
  256
);
const UPDATE_CONCURRENCY = readPositiveInteger(
  "FOOD_EMBEDDING_UPDATE_CONCURRENCY",
  10,
  50
);
const MAX_ATTEMPTS = 5;

interface FoodRow extends EmbeddableFood {
  id: string;
  updated_at: string;
  embedding_model: string | null;
  embedding_input_hash: string | null;
  embedding_updated_at: string | null;
}

interface PreparedFood {
  food: FoodRow;
  input: string;
  inputHash: string;
}

function readPositiveInteger(name: string, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function hashEmbeddingInput(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS) break;

      const exponentialDelay = 500 * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * 250);
      const delay = exponentialDelay + jitter;
      console.warn(
        `${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${delay}ms: ${errorMessage(error)}`
      );
      await sleep(delay);
    }
  }

  throw lastError;
}

async function fetchFoodPage(afterId: string | null): Promise<FoodRow[]> {
  return withRetry("Supabase page fetch", async () => {
    let query = supabase
      .from("foods")
      .select(
        [
          "id",
          "name",
          "brand",
          "brand_slug",
          "search_aliases",
          "variant_label",
          "source_category",
          "serving_size",
          "updated_at",
          "embedding_model",
          "embedding_input_hash",
          "embedding_updated_at",
        ].join(",")
      )
      .eq("is_active", true)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (afterId) query = query.gt("id", afterId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []) as unknown as FoodRow[];
  });
}

async function updateEmbedding(
  prepared: PreparedFood,
  embedding: number[]
): Promise<"updated" | "changed"> {
  return withRetry(`Supabase update for ${prepared.food.id}`, async () => {
    const { data, error } = await supabase
      .from("foods")
      .update({
        embedding,
        embedding_model: FOOD_EMBEDDING_MODEL,
        embedding_input_hash: prepared.inputHash,
        embedding_updated_at: new Date().toISOString(),
      })
      .eq("id", prepared.food.id)
      .eq("is_active", true)
      // Do not attach a vector generated from stale text if the food was edited
      // after this page was read. A later run will pick up the changed hash.
      .eq("updated_at", prepared.food.updated_at)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? "updated" : "changed";
  });
}

async function main(): Promise<void> {
  console.log("Starting food embedding backfill");
  console.log(`Model: ${FOOD_EMBEDDING_MODEL}`);
  console.log(
    `Page size: ${PAGE_SIZE}; embedding batch: ${EMBEDDING_BATCH_SIZE}; update concurrency: ${UPDATE_CONCURRENCY}`
  );

  let cursor: string | null = null;
  let scanned = 0;
  let alreadyCurrent = 0;
  let updated = 0;
  let changedDuringRun = 0;
  let failed = 0;
  let pageNumber = 0;

  while (true) {
    const foods = await fetchFoodPage(cursor);
    if (foods.length === 0) break;

    pageNumber += 1;
    scanned += foods.length;
    cursor = foods[foods.length - 1].id;

    const prepared = foods.map((food): PreparedFood => {
      const input = createFoodEmbeddingInput(food);
      return { food, input, inputHash: hashEmbeddingInput(input) };
    });

    const stale = prepared.filter(
      ({ food, inputHash }) =>
        food.embedding_model !== FOOD_EMBEDDING_MODEL ||
        food.embedding_input_hash !== inputHash ||
        !food.embedding_updated_at
    );
    alreadyCurrent += prepared.length - stale.length;

    console.log(
      `Page ${pageNumber}: ${foods.length} scanned, ${stale.length} require embeddings`
    );

    for (const embeddingBatch of chunks(stale, EMBEDDING_BATCH_SIZE)) {
      let embeddings: number[][];
      try {
        embeddings = await withRetry("OpenAI embedding batch", () =>
          generateEmbeddings(embeddingBatch.map((item) => item.input))
        );
      } catch (error) {
        failed += embeddingBatch.length;
        console.error(
          `Embedding batch permanently failed (${embeddingBatch.length} foods): ${errorMessage(error)}`
        );
        continue;
      }

      const updatePairs = embeddingBatch.map((item, index) => ({
        item,
        embedding: embeddings[index],
      }));

      for (const updateBatch of chunks(updatePairs, UPDATE_CONCURRENCY)) {
        await Promise.all(
          updateBatch.map(async ({ item, embedding }) => {
            try {
              const outcome = await updateEmbedding(item, embedding);
              if (outcome === "updated") updated += 1;
              else changedDuringRun += 1;
            } catch (error) {
              failed += 1;
              console.error(
                `Update permanently failed for ${item.food.id} (${item.food.name}): ${errorMessage(error)}`
              );
            }
          })
        );
      }
    }
  }

  console.log("Embedding backfill complete");
  console.log(`Scanned: ${scanned}`);
  console.log(`Already current: ${alreadyCurrent}`);
  console.log(`Updated: ${updated}`);
  console.log(`Changed during run (deferred): ${changedDuringRun}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Embedding backfill aborted: ${errorMessage(error)}`);
  process.exitCode = 1;
});
