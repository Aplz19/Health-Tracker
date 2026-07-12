import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { clearClientCache, setCached } from "@/lib/client-cache";
import {
  fetchFreshGlobalFoodSearch,
  getCachedGlobalFoodSearch,
} from "@/lib/food/global-search-client";

afterEach(() => clearClientCache());

function row(index: number) {
  return {
    id: `food-${index}`,
    name: `Chipotle Food ${index}`,
    brand: "Chipotle",
    serving_size: "1 serving",
    source: "restaurant_official",
  };
}

test("an explicit search refreshes a stale cached brand result", async () => {
  setCached("global_food_search:chipotle", [row(1), row(2)], { ttlMs: 60_000 });
  assert.equal(getCachedGlobalFoodSearch("CHIPOTLE")?.foods.length, 2);

  let requestedUrl = "";
  let requestedCache: RequestCache | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedCache = init?.cache;
    return new Response(JSON.stringify({ foods: Array.from({ length: 50 }, (_, i) => row(i)) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const fresh = await fetchFreshGlobalFoodSearch("Chipotle", undefined, fetcher);

  assert.equal(requestedUrl, "/api/food/search?q=chipotle");
  assert.equal(requestedCache, "no-store");
  assert.equal(fresh.foods.length, 50);
  assert.equal(getCachedGlobalFoodSearch("chipotle")?.foods.length, 50);
});

test("rejects an unsuccessful global search response", async () => {
  const fetcher = (async () =>
    new Response(JSON.stringify({ error: "Search unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    fetchFreshGlobalFoodSearch("Chipotle", undefined, fetcher),
    /Search unavailable/
  );
});

test("canonicalizes trailing and duplicate whitespace before the request and cache key", async () => {
  let requestedUrl = "";
  const fetcher = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ foods: [row(1)] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await fetchFreshGlobalFoodSearch("  Chipotle\u00a0  ", undefined, fetcher);

  assert.equal(requestedUrl, "/api/food/search?q=chipotle");
  assert.equal(getCachedGlobalFoodSearch("chipotle ")?.foods.length, 1);
});
