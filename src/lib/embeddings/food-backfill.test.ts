import assert from "node:assert/strict";
import test from "node:test";
import {
  mapWithConcurrency,
  prepareFoodEmbeddingRows,
  summarizeFoodEmbeddingBackfill,
} from "./food-backfill";

test("prepares deterministic canonical embedding inputs and hashes", () => {
  const [prepared] = prepareFoodEmbeddingRows([{
    id: "food-1",
    name: "Crunchwrap Supreme",
    brand: "Taco Bell",
    brand_slug: "taco-bell",
    search_aliases: ["tacobell"],
    variant_label: null,
    source_category: "Specialties",
    serving_size: "1 item",
    updated_at: "2026-07-10T00:00:00.000Z",
  }]);

  assert.match(prepared.input, /taco bell \| taco bell \| crunchwrap supreme/);
  assert.match(prepared.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(
    prepareFoodEmbeddingRows([prepared.food])[0].inputHash,
    prepared.inputHash,
  );
});
test("bounded mapper preserves result order and never exceeds concurrency", async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(results, [2, 4, 6, 8, 10, 12]);
  assert.equal(maximumActive, 3);
});

test("backfill summary conservatively reports retries and remaining rows", () => {
  assert.deepEqual(
    summarizeFoodEmbeddingBackfill(3, 5, ["updated", "changed", "failed"]),
    { scanned: 3, updated: 1, changed: 1, failed: 1, has_more: true },
  );
  assert.deepEqual(
    summarizeFoodEmbeddingBackfill(2, 2, ["updated", "updated"]),
    { scanned: 2, updated: 2, changed: 0, failed: 0, has_more: false },
  );
});
