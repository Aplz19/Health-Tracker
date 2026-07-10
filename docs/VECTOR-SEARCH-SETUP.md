# Food Search v2 Setup

The app has one authenticated global-search API with three rollout modes:

1. `hybrid`: indexed lexical and vector candidates merged in SQL.
2. `lexical`: the restaurant-catalog compatibility RPC.
3. `legacy`: a bounded name search for the current production schema.

Typing searches only the cached personal library. Global search starts only
when the user presses Enter or taps the globe button.

## Safety and rollout state

`sql/add_food_search_v2.sql` is staged and has **not** been applied. It assumes
`add_vector_search.sql` and `add_restaurant_food_import.sql` have already run.
Do not apply the catalog migrations until the offline restaurant bundle passes
review and the SQL has been tested against a non-production backup.

Required server-only environment variables:

```env
OPENAI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`OPENAI_API_KEY` is optional for ordinary search; without it the endpoint stays
lexical. `SUPABASE_SERVICE_ROLE_KEY` is required before v2 deployment because
barcode foods are verified and persisted by the server after direct browser
catalog writes are revoked. Neither key may use a `NEXT_PUBLIC_` prefix.

## Migration order

Run through the Supabase SQL editor only after the rollout gate:

1. `sql/add_vector_search.sql`
2. `sql/add_restaurant_food_import.sql`
3. `sql/add_food_search_v2.sql`

The v2 migration adds:

- trigger-maintained `search_document` and `search_tsv` fields;
- active-only GIN/trigram and HNSW indexes;
- `embedding_model`, `embedding_input_hash`, and `embedding_updated_at`;
- reciprocal-rank-fusion search in `search_foods_hybrid`;
- authenticated manual-food and library mutation RPCs;
- restricted direct catalog writes and unique active OFF barcodes; and
- an ownership backfill that runs only when exactly one auth user exists.

The application is migration-aware: it tries v2 RPCs first and falls back only
when those functions do not exist.

## Generate and refresh embeddings

After the SQL is applied:

```bash
npm run generate-embeddings
```

The backfill walks foods in stable ID pages, builds one canonical input from
brand/name/aliases/variant/category/serving, hashes it, skips current rows,
batches OpenAI requests, retries transient failures, limits update concurrency,
and refuses to apply an embedding if the source text changed mid-request.

Changing any embedding-input field clears the old vector through the database
trigger. Rerun the command to fill only missing or stale rows.

## Request path

```text
Food picker Enter
  -> GET /api/food/search (cookie auth, validation, rate limit)
  -> capability probe with no embedding cost
  -> query embedding cache (only with v2 RPC + OpenAI key)
  -> search_foods_hybrid
       lexical: exact + FTS + trigram
       semantic: active HNSW cosine
       merge: reciprocal rank fusion + small auth.uid() library tie-break
  -> compact Food JSON with no embedding vector
```

Older browser requests are aborted/ignored, and query results live in a bounded
ten-minute client cache.

## Verification before production

```bash
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

Also test two-user RLS, inactive food versions, concurrent duplicate barcodes,
and relevance fixtures such as `tacobell crunchwrap`, `taco bell crunchwrap`,
and `in n out double double`. Use `EXPLAIN (ANALYZE, BUFFERS)` on a large seed to
confirm PostgreSQL selects the GIN and HNSW indexes.
