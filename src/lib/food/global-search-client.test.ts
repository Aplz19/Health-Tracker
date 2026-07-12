import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { clearClientCache } from "@/lib/client-cache";
import {
  canDisplayGlobalFoodSearchState,
  fetchFreshGlobalFoodSearch,
  getCachedGlobalFoodSearch,
} from "@/lib/food/global-search-client";

test("hides materialized search state during an account switch", () => {
  assert.equal(canDisplayGlobalFoodSearchState("user-a", "user-a"), true);
  assert.equal(canDisplayGlobalFoodSearchState("user-a", "user-b"), false);
  assert.equal(canDisplayGlobalFoodSearchState("user-a", null), false);
});

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
  const userId = "user-a";
  const staleFetcher = (async () =>
    new Response(
      JSON.stringify({
        foods: [row(1), row(2)],
        totalCount: 144,
        offset: 0,
        limit: 50,
        hasMore: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;
  await fetchFreshGlobalFoodSearch("Chipotle", { userId, fetcher: staleFetcher });
  assert.equal(getCachedGlobalFoodSearch("CHIPOTLE", userId)?.foods.length, 2);
  assert.equal(getCachedGlobalFoodSearch("CHIPOTLE", "user-b"), null);

  let requestedUrl = "";
  let requestedCache: RequestCache | undefined;
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedCache = init?.cache;
    return new Response(
      JSON.stringify({
        foods: Array.from({ length: 50 }, (_, i) => row(i)),
        totalCount: 144,
        offset: 0,
        limit: 50,
        hasMore: true,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const fresh = await fetchFreshGlobalFoodSearch("Chipotle", { userId, fetcher });

  assert.equal(requestedUrl, "/api/food/search?q=chipotle&limit=50&offset=0");
  assert.equal(requestedCache, "no-store");
  assert.equal(fresh.foods.length, 50);
  assert.equal(fresh.totalCount, 144);
  assert.equal(fresh.hasMore, true);
  assert.equal(getCachedGlobalFoodSearch("chipotle", userId)?.foods.length, 50);
});

test("rejects an unsuccessful global search response", async () => {
  const fetcher = (async () =>
    new Response(JSON.stringify({ error: "Search unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    fetchFreshGlobalFoodSearch("Chipotle", { userId: "user-a", fetcher }),
    /Search unavailable/
  );
});

test("canonicalizes trailing and duplicate whitespace before the request and cache key", async () => {
  let requestedUrl = "";
  const fetcher = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        foods: [row(1)],
        totalCount: 1,
        offset: 0,
        limit: 50,
        hasMore: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  await fetchFreshGlobalFoodSearch("  Chipotle\u00a0  ", {
    userId: "user-a",
    fetcher,
  });

  assert.equal(requestedUrl, "/api/food/search?q=chipotle&limit=50&offset=0");
  assert.equal(getCachedGlobalFoodSearch("chipotle ", "user-a")?.foods.length, 1);
});

test("requests and caches later result pages independently", async () => {
  let requestedUrl = "";
  const fetcher = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify({
        foods: Array.from({ length: 20 }, (_, i) => row(i + 50)),
        totalCount: 70,
        offset: 50,
        limit: 50,
        hasMore: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  const page = await fetchFreshGlobalFoodSearch("Chipotle", {
    userId: "user-a",
    offset: 50,
    fetcher,
  });

  assert.equal(requestedUrl, "/api/food/search?q=chipotle&limit=50&offset=50");
  assert.equal(page.foods.length, 20);
  assert.equal(page.totalCount, 70);
  assert.equal(page.hasMore, false);
  assert.equal(
    getCachedGlobalFoodSearch("Chipotle", "user-a", 50)?.foods.length,
    20
  );
});
