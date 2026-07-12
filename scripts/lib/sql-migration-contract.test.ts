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

test("hybrid search resolves Supabase pgvector operators from the extensions schema", () => {
  const sql = migration("add_food_search_v2.sql");
  assert.match(sql, /OPERATOR\(extensions\.<=>\)/);
  assert.doesNotMatch(sql, /embedding\s*<=>/);
});

test("hybrid search v3 adds bounded indexed prefix and word-typo retrieval", () => {
  const sql = migration("add_food_search_v3.sql");
  assert.match(sql, /split\.token_position <= 8/);
  assert.match(sql, /quote_literal\(tokens\.token\) \|\| ':\*'/);
  assert.match(sql, /to_tsquery\([\s\S]*'simple'::regconfig/);
  assert.match(sql, /f\.search_tsv @@ p\.prefix_query/);
  assert.match(sql, /ts_rank_cd\(f\.search_tsv, p\.prefix_query, 32\)/);
  assert.match(sql, /f\.search_document OPERATOR\(extensions\.%>\) p\.query/);
  assert.match(sql, /f\.name OPERATOR\(extensions\.%\) p\.query/);
  assert.match(sql, /f\.brand OPERATOR\(extensions\.%\) p\.query/);
  assert.match(sql, /extensions\.similarity\(f\.name, p\.query\)/);
  assert.match(sql, /extensions\.similarity\(coalesce\(f\.brand, ''\), p\.query\)/);
  assert.match(sql, /extensions\.word_similarity\(p\.query, f\.search_document\)/);
  assert.match(sql, /\(SELECT count\(\*\) FROM query_tokens\) = 1/);
  assert.match(sql, /structured\.normalized_name = p\.query/);
  assert.match(sql, /structured\.normalized_brand = p\.query/);
  assert.match(sql, /structured\.normalized_brand_name = p\.query/);
  assert.match(sql, /aliases\.alias_exact/);
  assert.match(sql, /aliases\.alias_prefix/);
});

test("hybrid search v3 preserves the v2 RPC, security, and ranking contract", () => {
  const v2 = migration("add_food_search_v2.sql");
  const v3 = migration("add_food_search_v3.sql");
  const returnSchema = (sql: string) =>
    sql.match(/RETURNS TABLE \(([\s\S]*?)\)\s*LANGUAGE sql/)?.[1].replace(/\s+/g, " ").trim();

  assert.equal(returnSchema(v3), returnSchema(v2), "v3 must preserve the exact return schema");
  assert.match(v3, /SECURITY INVOKER\s+SET search_path = pg_catalog, public/);
  assert.ok(
    [...v3.matchAll(/f\.source <> 'manual' OR f\.created_by = auth\.uid\(\)/g)].length >= 4,
    "prefix, typo, semantic, and fused candidates must all fail closed",
  );
  assert.match(v3, /1\.25 \/ \(60\.0 \+ lexical_rank\)/);
  assert.match(v3, /1\.0 \/ \(60\.0 \+ semantic_rank\)/);
  assert.match(v3, /cosine_distance <= 0\.75/);
  assert.match(v3, /least\(greatest\(coalesce\(result_limit, 50\), 1\), 50\)/);
  assert.match(v3, /greatest\(coalesce\(result_limit, 50\) \* 4, 50\),\s*200/);
  assert.match(
    v3,
    /REVOKE ALL ON FUNCTION public\.search_foods_hybrid\(text, extensions\.vector, text, integer\)[\s\S]*FROM PUBLIC, anon[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated/,
  );
});

test("food visibility is global except for caller-owned manual rows", () => {
  const sql = migration("add_food_search_v2.sql");
  assert.match(
    sql,
    /CREATE POLICY foods_authenticated_read_v2[\s\S]*USING \(source <> 'manual' OR created_by = auth\.uid\(\)\)/,
  );
  assert.match(
    sql,
    /WHERE id = food_id_param[\s\S]*AND \(source <> 'manual' OR created_by = current_user_id\)/,
  );
  assert.match(
    sql,
    /CREATE POLICY user_food_library_own_read_v2[\s\S]*food\.is_active IS TRUE/,
  );
  assert.match(
    sql,
    /DROP POLICY IF EXISTS "Users can view own user_food_library"[\s\S]*CREATE POLICY user_food_library_own_read_v2/,
  );
  assert.match(sql, /CREATE POLICY user_food_library_active_guard_v2[\s\S]*AS RESTRICTIVE/);
  assert.ok(
    [...sql.matchAll(/f\.source <> 'manual' OR f\.created_by = auth\.uid\(\)/g)].length >= 3,
    "hybrid lexical, semantic, and fused candidates must all fail closed",
  );
});

test("legacy search RPCs are authenticated-only and active-only", () => {
  const restaurant = migration("add_restaurant_food_import.sql");
  const vector = migration("add_vector_search.sql");
  assert.match(
    restaurant,
    /REVOKE ALL ON FUNCTION public\.search_global_foods\(text, integer\)[\s\S]*FROM PUBLIC, anon[\s\S]*GRANT EXECUTE[\s\S]*TO authenticated/,
  );
  assert.match(
    vector,
    /REVOKE ALL ON FUNCTION public\.search_foods_semantic\(extensions\.vector, double precision, integer\)[\s\S]*FROM PUBLIC, anon/,
  );
  assert.match(vector, /foods\.is_active IS TRUE/);
  assert.doesNotMatch(vector, /user_food_library\.user_id = user_id_param/);
});

test("extension-backed operators and opclasses are schema-qualified and asserted", () => {
  const vector = migration("add_vector_search.sql");
  const restaurant = migration("add_restaurant_food_import.sql");
  const hybrid = migration("add_food_search_v2.sql");
  for (const sql of [vector, restaurant, hybrid]) {
    assert.match(sql, /WITH SCHEMA extensions/);
    assert.match(sql, /trusted extensions schema/);
  }
  assert.match(vector, /extensions\.vector_cosine_ops/);
  assert.match(restaurant, /extensions\.gin_trgm_ops/);
  assert.match(restaurant, /extensions\.similarity/);
  assert.match(hybrid, /extensions\.gin_trgm_ops/);
  assert.match(hybrid, /extensions\.vector_cosine_ops/);
  assert.match(hybrid, /OPERATOR\(extensions\.%\)/);
});

test("new chain snapshots are unique, monotonic, clock-bounded, and replay-first", () => {
  const sql = migration("add_restaurant_food_import.sql");
  assert.match(sql, /UNIQUE \(chain\)/);
  assert.equal(
    [...sql.matchAll(/^\s+serving_size_grams numeric\(10,\s*2\),/gm)].length,
    2,
    "serving grams must be canonicalized to the live foods column scale before replay comparison",
  );
  assert.match(sql, /approved_at > transaction_timestamp\(\) \+ interval '10 minutes'/);
  assert.match(sql, /incoming\.approved_at <= coalesce\(\([\s\S]*max\(existing\.approved_at\)/);
  const replay = sql.indexOf("A complete exact replay is a zero-write result");
  const freshness = sql.indexOf("New snapshots must advance each chain's trusted approval clock");
  assert.ok(replay >= 0 && freshness > replay, "exact replay must precede freshness checks");
  assert.match(sql, /'status', 'IDEMPOTENT_REPLAY'[\s\S]*'inserted_provenance', 0/);
});

test("restaurant imports journal complete snapshot and personal-library transitions", () => {
  const sql = migration("add_restaurant_food_import.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS food_import_transitions/);
  assert.match(sql, /'observe', 'activate', 'replace', 'reactivate', 'deactivate_missing'/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS food_import_library_transitions/);
  assert.match(sql, /to_link_preexisted boolean NOT NULL/);
  assert.match(sql, /food import transition journals are immutable/);
  assert.match(sql, /CREATE TEMP TABLE pg_temp\.restaurant_missing_target/);
  assert.match(sql, /transition\.transition_type IN \('replace', 'reactivate', 'deactivate_missing'\)/);
  assert.match(sql, /INSERT INTO public\.user_food_library \(id, user_id, food_id, added_at\)/);
  assert.match(sql, /DELETE FROM public\.user_food_library library/);
  assert.doesNotMatch(sql, /supersedes_food_id\s*=/);
  assert.match(sql, /contract upgrade required/);
  assert.match(sql, /qualified nutrient mapping violates the v1 midpoint convention/);
});
