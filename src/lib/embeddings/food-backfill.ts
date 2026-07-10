import { createHash } from "node:crypto";
import {
  createFoodEmbeddingInput,
  type EmbeddableFood,
} from "@/lib/food/embedding-input";

export const FOOD_EMBEDDING_BATCH_LIMIT = 100;
export const FOOD_EMBEDDING_UPDATE_CONCURRENCY = 10;

export interface FoodEmbeddingRow extends EmbeddableFood {
  id: string;
  updated_at: string;
}
export interface PreparedFoodEmbedding {
  food: FoodEmbeddingRow;
  input: string;
  inputHash: string;
}

export type FoodEmbeddingUpdateOutcome = "updated" | "changed" | "failed";

export interface FoodEmbeddingBackfillResult {
  scanned: number;
  updated: number;
  changed: number;
  failed: number;
  has_more: boolean;
}

export function hashFoodEmbeddingInput(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function prepareFoodEmbeddingRows(
  foods: FoodEmbeddingRow[],
): PreparedFoodEmbedding[] {
  return foods.map((food) => {
    const input = createFoodEmbeddingInput(food);
    return { food, input, inputHash: hashFoodEmbeddingInput(input) };
  });
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer");
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function summarizeFoodEmbeddingBackfill(
  scanned: number,
  totalStale: number | null,
  outcomes: FoodEmbeddingUpdateOutcome[],
): FoodEmbeddingBackfillResult {
  const updated = outcomes.filter((outcome) => outcome === "updated").length;
  const changed = outcomes.filter((outcome) => outcome === "changed").length;
  const failed = outcomes.filter((outcome) => outcome === "failed").length;
  const knownMore = totalStale === null
    ? scanned === FOOD_EMBEDDING_BATCH_LIMIT
    : totalStale > scanned;

  return {
    scanned,
    updated,
    changed,
    failed,
    has_more: knownMore || changed > 0 || failed > 0,
  };
}
