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
CRON_SECRET=...
RESTAURANT_IMPORT_SECRET=...
RESTAURANT_IMPORT_ALLOWED_SHA256=...
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
4. Dry-run the exact approved bundle:

   ```bash
   npm run import-restaurant-foods -- <bundle-directory>
   ```

5. Apply it only after the dry-run counts and `rpc_payload_sha256` match the
   reviewed, hash-declared manifest. Add that exact payload hash to Vercel's
   `RESTAURANT_IMPORT_ALLOWED_SHA256` before deploying. Production uses the
   Vercel bridge so the Supabase service-role key never leaves Vercel:

   ```powershell
   $env:RESTAURANT_IMPORT_URL = "https://<production-domain>/api/admin/restaurant-import"
   $env:RESTAURANT_IMPORT_SECRET = "<same-dedicated-secret-configured-in-vercel>"
   npm run import-restaurant-foods -- <bundle-directory> --apply-via-vercel
   ```

6. Verify the RPC's exact batch/food/provenance counts, active-version search,
   and historical food-log stability before generating embeddings or deploying.

The v2 migration adds:

- trigger-maintained `search_document` and `search_tsv` fields;
- active-only GIN/trigram and HNSW indexes;
- `embedding_model`, `embedding_input_hash`, and `embedding_updated_at`;
- reciprocal-rank-fusion search in `search_foods_hybrid`;
- authenticated manual-food and library mutation RPCs;
- restricted direct catalog writes and unique active OFF barcodes; and
- a per-food ownership backfill that assigns a legacy manual food only when its
  library links contain exactly one distinct user.

The application is migration-aware: it tries v2 RPCs first and falls back only
when those functions do not exist.

`import_restaurant_food_bundle(jsonb)` is a service-role-only security-definer
RPC. It accepts at most 64 chains, 20,000 foods/provenance rows, and 64 MiB. One
call is one database transaction, so batches, foods, active-version changes, and
provenance either all commit or all roll back. Exact replay is a zero-write
`IDEMPOTENT_REPLAY`; hash/key collisions with different values fail closed.

The Vercel transport route is intentionally narrower than the database RPC: it
requires exact timing-safe bearer authorization, `application/json`, an honest
`Content-Length`, no content encoding, and at most 4 MiB. It streams and counts
the actual request bytes, requires their SHA-256 in the configured allowlist
before parsing, does a shallow v1 contract/count check, then makes one RPC call.
The bundle's unkeyed hashes detect change but are not signatures; bundle origin,
the local collector, and transfer path must already be trusted. The dedicated
import bearer plus exact-body allowlist is the production authorization layer.
Split a payload over 4 MiB only at whole-chain batch boundaries. Each batch is a
complete chain snapshot; splitting one chain would interpret omitted items as
missing and deactivate them. The current combined three-chain payload and every
individual per-chain payload fit the bridge. Direct local `--apply` is retained
only for controlled rehearsals where the service-role key is already available
locally.

In contract v1, `content_hash` covers serving and the core mapped nutrients.
Changes to grams, optional nutrients, or display metadata under the same source
identity/hash fail the RPC's full-row collision check by design. Operators must
not bypass that rejection as though it were an outage; evolve the contract to
v2 and regenerate and revalidate the bundle.

## Generate and refresh embeddings

After the SQL is applied, the restaurant import is verified, and current active
food counts are correct, use the bounded production bridge:

```powershell
$embeddingUrl = "https://<production-domain>/api/admin/food-embeddings"
do {
  $result = Invoke-RestMethod -Method Post -Uri $embeddingUrl -Headers @{
    Authorization = "Bearer $env:CRON_SECRET"
  }
  $result | ConvertTo-Json -Compress
  if ($result.failed -gt 0) { throw "Embedding batch reported failures" }
} while ($result.has_more)
```

Each call processes at most 100 active stale rows, builds one canonical input
from brand/name/aliases/variant/category/serving, makes one batched OpenAI
request, limits update concurrency to 10, and refuses to write when `updated_at`
changed after selection. Its no-store response contains counts only. The local
`npm run generate-embeddings` command remains available for rehearsals where
OpenAI and service-role keys are intentionally present locally.

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

## Rollback order

Before a Vercel push, keep the dated database backup and record the imported
batch keys. If post-import checks fail:

1. Stop further imports and embedding generation.
2. Restore the dated pre-import backup using the tested Supabase recovery
   process. Do not run ad-hoc activation, deletion, or personal-library SQL.
3. A journal-driven alternative is permitted only after a separate rollback
   procedure consumes both `food_import_transitions` and
   `food_import_library_transitions`, proves complete state restoration, and is
   rehearsed against a restored backup. Until then, backup restore is the only
   supported data rollback.
4. Re-run catalog/global-search and historical-log checks. Revert and redeploy
   application code separately if the failure is in code.

The restaurant-import and search-v2 scripts are explicitly transactional, so a
failure while applying either rolls back that script. Apply the older vector
bootstrap as one reviewed SQL-editor operation. Once data is imported, dropping
columns/tables is not a safe routine rollback.
