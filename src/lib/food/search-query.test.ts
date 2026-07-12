import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFood } from "@/lib/food/client-food";
import {
  isSameFoodSearchQuery,
  normalizeFoodSearchQuery,
  rankFoodSearchResults,
} from "@/lib/food/search-query";
import { buildLegacyFoodSearchFilters } from "@/lib/food/server-search";

function food(id: string, name: string, brand: string | null = null) {
  return normalizeFood({ id, name, brand, serving_size: "1 serving" });
}

test("normalizes punctuation, apostrophes, accents, and whitespace", () => {
  assert.equal(normalizeFoodSearchQuery("  Dunkin’  Cold-Brew "), "dunkin cold brew");
  assert.equal(normalizeFoodSearchQuery("Crème brûlée"), "creme brulee");
  assert.equal(normalizeFoodSearchQuery("'Chipotle\""), "chipotle");
});

test("preserves letters and numbers outside ASCII", () => {
  assert.equal(normalizeFoodSearchQuery("鸡肉  100克"), "鸡肉 100克");
});

test("treats case, punctuation, and whitespace-only edits as the same search", () => {
  assert.equal(isSameFoodSearchQuery("Chipotle", "  CHIPOTLE\u00a0"), true);
  assert.equal(isSameFoodSearchQuery("Chick-fil-A", "chick fil a"), true);
  assert.equal(isSameFoodSearchQuery("Qdob", "Qdoba"), false);
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

test("ranks a restaurant brand prefix above an unrelated item-name prefix", () => {
  const results = rankFoodSearchResults(
    [
      food("cookie", "Chocolate Chip Cookie"),
      food("restaurant", "Chicken Burrito", "Chipotle"),
    ],
    "chip"
  );

  assert.equal(results[0].id, "restaurant");
});

test("legacy compatibility search includes brand fields", () => {
  assert.deepEqual(
    buildLegacyFoodSearchFilters("chipotle chicken"),
    [
      "name.ilike.%chipotle%,brand.ilike.%chipotle%,brand_slug.ilike.%chipotle%",
      "name.ilike.%chicken%,brand.ilike.%chicken%,brand_slug.ilike.%chicken%",
    ]
  );
  assert.deepEqual(
    buildLegacyFoodSearchFilters("chipotle", false),
    ["name.ilike.%chipotle%"]
  );
});
