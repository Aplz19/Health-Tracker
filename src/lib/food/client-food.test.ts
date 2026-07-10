import assert from "node:assert/strict";
import { test } from "node:test";

import type { Food } from "@/lib/supabase/types";
import { FOOD_CLIENT_COLUMNS, normalizeFood } from "./client-food";

test("normalizes a legacy row into the complete browser food contract", () => {
  const food = normalizeFood({
    id: "food-1",
    name: "Crunchwrap Supreme",
    serving_size: "1 item",
    calories: 530,
    source: "restaurant_official",
    is_active: false,
  });

  assert.equal(food.calories, 530);
  assert.equal(food.protein, 0);
  assert.equal(food.brand, null);
  assert.deepEqual(food.search_aliases, []);
  assert.equal(food.source, "restaurant_official");
  assert.equal(food.is_active, false);
  assert.equal(food.created_at, "");
});

test("falls back safely when a legacy row has an unknown source", () => {
  const food = normalizeFood({
    id: "food-2",
    name: "Custom food",
    serving_size: "1 serving",
    source: "legacy-import" as Food["source"],
  });

  assert.equal(food.source, "manual");
});

test("browser food projections never request the embedding vector", () => {
  const columns = FOOD_CLIENT_COLUMNS.split(",").map((column) => column.trim());

  assert.equal(columns.includes("embedding"), false);
  assert.equal(columns.includes("id"), true);
  assert.equal(columns.includes("name"), true);
  assert.equal(columns.includes("calories"), true);
});
