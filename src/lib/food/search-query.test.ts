import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFood } from "@/lib/food/client-food";
import {
  isSameFoodSearchQuery,
  matchAndRankFoodSearchResults,
  normalizeFoodSearchQuery,
  rankFoodSearchResults,
} from "@/lib/food/search-query";
import { buildLegacyFoodSearchFilters } from "@/lib/food/server-search";
import type { Food } from "@/lib/supabase/types";

function food(
  id: string,
  name: string,
  brand: string | null = null,
  extra: Partial<Food> = {}
) {
  return normalizeFood({ id, name, brand, serving_size: "1 serving", ...extra });
}

test("normalizes punctuation, apostrophes, accents, and whitespace", () => {
  assert.equal(normalizeFoodSearchQuery("  Dunkin’  Cold-Brew "), "dunkin cold brew");
  assert.equal(normalizeFoodSearchQuery("Crème brûlée"), "creme brulee");
  assert.equal(normalizeFoodSearchQuery("'Chipotle\""), "chipotle");
  assert.equal(normalizeFoodSearchQuery("Chef's  Açaí"), "chefs acai");
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

test("local matching supports generic compact-brand and ordered word prefixes", () => {
  const foods = [
    food("target", "Garden Crunch Wrap", "North Star Grill"),
    food("wrong-brand", "Garden Crunch Wrap", "Southern Kitchen"),
    food("wrong-item", "Garden Salad", "North Star Grill"),
  ];

  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "northstar crun").map(({ id }) => id),
    ["target"]
  );
  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "north st g cr").map(({ id }) => id),
    ["target"]
  );
});

test("local matching finds all word prefixes but rewards their natural order", () => {
  const results = matchAndRankFoodSearchResults(
    [
      food("ordered", "Spicy Chicken Sandwich"),
      food("unordered", "Chicken with Spicy Sauce"),
      food("missing", "Spicy Beef Sandwich"),
    ],
    "spi chi"
  );

  assert.deepEqual(results.map(({ id }) => id), ["ordered", "unordered"]);
});

test("local matching uses aliases without special-casing a restaurant", () => {
  const results = matchAndRankFoodSearchResults(
    [
      food("alias", "Harvest Bowl", "The North Star Company", {
        search_aliases: ["Northstar"],
      }),
      food("other", "Harvest Bowl", "Other Brand"),
    ],
    "northst harv"
  );

  assert.deepEqual(results.map(({ id }) => id), ["alias"]);
});

test("local matching recovers bounded long-token typos and transpositions", () => {
  const foods = [
    food("target", "Chipotle Chicken Bowl", "North Star Grill"),
    food("other", "Chocolate Chicken Bowl", "North Star Grill"),
  ];

  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "chipolte").map(({ id }) => id),
    ["target"]
  );
  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "chipotlee").map(({ id }) => id),
    ["target"]
  );
});

test("local matching does not fuzz arbitrary one- or two-character fragments", () => {
  const foods = [food("target", "Rice Bowl", "North Star Grill")];

  assert.deepEqual(matchAndRankFoodSearchResults(foods, "ri").map(({ id }) => id), [
    "target",
  ]);
  assert.deepEqual(matchAndRankFoodSearchResults(foods, "rz"), []);
  assert.deepEqual(matchAndRankFoodSearchResults(foods, "x"), []);
});

test("local matching keeps single short typos strict but permits one anchored typo", () => {
  const foods = [
    food("sandwich", "Chicken Sandwich"),
    food("chips", "Chips and Salsa"),
  ];

  assert.deepEqual(matchAndRankFoodSearchResults(foods, "chik"), []);
  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "chik sand").map(({ id }) => id),
    ["sandwich"]
  );
  assert.deepEqual(matchAndRankFoodSearchResults(foods, "chik sandwih"), []);
});

test("local matching returns no nonmatches and preserves input for an empty query", () => {
  const foods = [food("first", "Apple"), food("second", "Banana")];

  assert.deepEqual(matchAndRankFoodSearchResults(foods, "steak"), []);
  assert.deepEqual(
    matchAndRankFoodSearchResults(foods, "   ").map(({ id }) => id),
    ["first", "second"]
  );
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
