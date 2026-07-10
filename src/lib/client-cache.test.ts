import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  clearClientCache,
  deleteCached,
  getCached,
  hasCached,
  setCached,
} from "./client-cache";

afterEach(() => {
  clearClientCache();
});

test("stores, reads, and deletes cached values", () => {
  setCached("food:1", { name: "Burrito" });

  assert.deepEqual(getCached("food:1"), { name: "Burrito" });
  assert.equal(hasCached("food:1"), true);

  deleteCached("food:1");
  assert.equal(getCached("food:1"), undefined);
  assert.equal(hasCached("food:1"), false);
});

test("expires entries at their TTL boundary", () => {
  const originalNow = Date.now;
  let now = 1_000;
  Date.now = () => now;

  try {
    setCached("global-search:taco", ["result"], { ttlMs: 50 });
    now = 1_049;
    assert.deepEqual(getCached("global-search:taco"), ["result"]);

    now = 1_050;
    assert.equal(getCached("global-search:taco"), undefined);
  } finally {
    Date.now = originalNow;
  }
});

test("deletes related entries by prefix without touching other namespaces", () => {
  setCached("food-logs:2026-07-09", [1]);
  setCached("food-logs:2026-07-10", [2]);
  setCached("habit-logs:2026-07-10", [3]);

  deleteCached("food-logs:", true);

  assert.equal(getCached("food-logs:2026-07-09"), undefined);
  assert.equal(getCached("food-logs:2026-07-10"), undefined);
  assert.deepEqual(getCached("habit-logs:2026-07-10"), [3]);
});

test("evicts the least recently used entry after reaching the size limit", () => {
  for (let index = 0; index < 200; index += 1) {
    setCached(`entry:${index}`, index);
  }

  // Reading the oldest entry makes it the most recently used.
  assert.equal(getCached("entry:0"), 0);
  setCached("entry:200", 200);

  assert.equal(getCached("entry:0"), 0);
  assert.equal(getCached("entry:1"), undefined);
  assert.equal(getCached("entry:200"), 200);
});
