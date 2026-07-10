import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function migration(name: string) {
  return readFileSync(resolve(process.cwd(), "sql", name), "utf8");
}

test("legacy manual-food ownership is inferred per food, never from global account count", () => {
  const sql = migration("add_food_search_v2.sql");
  assert.match(sql, /GROUP BY library\.food_id/);
  assert.match(sql, /HAVING count\(DISTINCT library\.user_id\) = 1/);
  assert.doesNotMatch(sql, /SELECT count\(\*\).*FROM auth\.users/);
});

test("restaurant importer is one service-role-only bounded JSONB RPC", () => {
  const sql = migration("add_restaurant_food_import.sql");
  assert.match(sql, /FUNCTION public\.import_restaurant_food_bundle\(bundle jsonb\)/);
  assert.match(sql, /octet_length\(bundle::text\) > 67108864/);
  assert.match(sql, /jsonb_array_length\(bundle -> 'foods'\) <> food_count/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.import_restaurant_food_bundle\(jsonb\)\s+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.import_restaurant_food_bundle\(jsonb\)\s+TO service_role/);
});
