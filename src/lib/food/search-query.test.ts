import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFood } from "@/lib/food/client-food";
import {
  normalizeFoodSearchQuery,
  rankFoodSearchResults,
} from "@/lib/food/search-query";

function food(id: string, name: string, brand: string | null = null) {
  return normalizeFood({ id, name, brand, serving_size: "1 serving" });
}

test("normalizes punctuation, apostrophes, accents, and whitespace", () => {
  assert.equal(normalizeFoodSearchQuery("  Dunkin’  Cold-Brew "), "dunkin cold brew");
  assert.equal(normalizeFoodSearchQuery("Crème brûlée"), "creme brulee");
});

test("preserves letters and numbers outside ASCII", () => {
  assert.equal(normalizeFoodSearchQuery("鸡肉  100克"), "鸡肉 100克");
});

test("ranks an exact brand and item phrase above partial matches", () => {
  const results = rankFoodSearchResults(
    [
      food("partial", "Crunchwrap Bites"),
      food("exact", "Crunchwrap Supreme", "Taco Bell"),
      food("other", "Supreme Taco", "Other Brand"),
    ],
    "tacobell crunchwrap supreme"
  );

  assert.equal(results[0].id, "exact");
});
