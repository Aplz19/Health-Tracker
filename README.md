# Health Tracker

Personal health-tracking PWA for diet/macros, workouts, supplements, habits,
and Whoop recovery/sleep/strain. Data is stored in Supabase and summarized in
an AI-analysis-friendly `daily_summaries` shape. It is built for the owner today
with per-user boundaries underneath.

## Stack

- Next.js 16.2.10 (App Router/Turbopack), React 19, and TypeScript
- Tailwind 4 with shadcn/Radix UI primitives
- Supabase Postgres, Auth, RLS, and browser/server clients
- Installable iOS/web PWA with manifest, icons, and a static-only service worker
- Whoop OAuth sync, Open Food Facts barcode ingestion, and hybrid food search
- Vercel deployment; pushing `main` deploys production

## Repository layout

```text
src/
|- app/            routes, auth pages, and authenticated api/* handlers
|- components/     feature UI (tabs, meals, food, workout, settings, etc.)
|  `- ui/          shared shadcn-style primitives
|- contexts/       auth, date, overlay, and preference providers
|- hooks/          Supabase-backed domain hooks and session caching
`- lib/            Supabase, search, Whoop, Open Food Facts, cache, utilities
sql/               staged/manual SQL migrations (no automatic runner)
scripts/           restaurant validation and embedding maintenance
docs/              operational setup notes
```

## Data-layer conventions

1. Client hooks use the local Supabase session; protected API routes verify the
   signed-in user server-side. RLS remains the actual per-user security boundary.
2. `src/lib/client-cache.ts` is a bounded 200-entry TTL/LRU memory cache. Hooks
   seed from it, render cached data immediately, and revalidate in the
   background. It is cleared on every authenticated-user transition.
3. Hooks that must exist unconditionally accept an `enabled` flag and skip
   unused queries. See `useSupplement`.
4. Mutations update local state/cache after confirmed writes. Food logging now
   awaits the database result and keeps failures visible instead of closing the
   dialog silently.
5. Durable settings belong in per-user Supabase tables, not bare localStorage.
6. Browser food projections explicitly exclude the 1,536-number `embedding`
   column. Daily-summary catalog lookups are ID-scoped rather than table-wide.
7. `foods.name` is the item and nullable `brand` is the manufacturer/restaurant.
   `source` is provenance (`manual`, `openfoodfacts`,
   `restaurant_official`, etc.), not a display label.

## Habits v2

User-defined habit tracking with typed values. Source of truth is the
`user_habits` table (`sql/add_habits_v2.sql`); the hardcoded
`HABIT_DEFINITIONS` list survives only as the pre-migration fallback and the
icon map for seeded built-ins.

**Value kinds** (`user_habits.value_kind`, snapshotted onto every
`habit_logs.value_kind` at write time):

- `checkbox` — did/didn't (`completed`)
- `number` — an amount (`amount`); a non-null `goal_amount` renders the
  one-tap quick-complete checkbox that logs the goal (the old "goal mode")
- `scale` — subjective 1–5 (`amount`)
- `choice` — one of `choice_options` (`value_text`), e.g. day type
  green/red/life

**Sparse truth (do not break this):** an absent log row means NOT REPORTED,
never zero/false. Scale/choice rows are never auto-created and clearing a
value DELETES the row. Checkbox/number keep the legacy placeholder-row
behavior (a `completed=false, amount=null` row appears when a day is first
viewed; `amount=null` still interprets as "not entered"). All interpretation
goes through `interpretLog()` in `src/lib/habits/logic.ts` — never read
`completed`/`amount` directly. Analytics must exclude `logged=false` entries,
not treat them as 0.

**Kind changes never rewrite history:** each log row keeps the `value_kind` it
was recorded under; changing a habit's kind affects future logs only. Habits
are archived (`archived_at`), never deleted. Legacy rows with `value_kind
NULL` interpret via the habit's current kind.

**Graceful fallback:** while `sql/add_habits_v2.sql` is unapplied,
`use-habits.ts` detects the missing table (`isMissingSchemaError`) and serves
the legacy built-ins + `user_habit_preferences` path; custom habits,
scale/choice, and the day note hide themselves. Writes omit the v2 columns in
this mode so they succeed against the old schema. Same pattern as
`use-nutrition-goals.ts`.

**Daily notes:** `daily_notes` (one row per user per day) is the free-text
journal; it and a per-habit entry list (`habits`, `day_note`) are aggregated
into `daily_summaries` by `src/lib/daily-summary/aggregate.ts`, so the
analytics pipeline sees habit data. Habit metadata shared with server code
lives icon-free in `src/lib/habits/meta.ts` (keep it in sync with the seed
VALUES in the migration).

Key files: `src/lib/habits/{meta,config,logic}.ts` (+ `logic.test.ts`),
`src/hooks/{use-habits,use-habit-logs,use-daily-note}.ts`,
`src/components/tabs/habits-tab.tsx`,
`src/components/settings/{habits-settings,habit-editor-dialog}.tsx`,
`src/components/habits/habit-icon.tsx`.

## Food discovery model

Both the standalone Food Library and the meal picker follow the intended
personal-first interaction:

- Typing searches the session-cached personal library only. A shared generic
  ranker handles exact brand/item identity, compact brands, ordered and
  all-token prefixes, aliases, and one conservative typo; there is no network
  request per keystroke. Empty-query quick picks may use device recency, but
  recency never overwrites text relevance.
- Enter or the visible **Search All** control calls authenticated
  `GET /api/food/search`; the interface always explains this second stage even
  when personal matches already exist.
- The client aborts stale requests and accepts only the latest response.
- Case, punctuation, and whitespace-only edits keep an already-valid global
  result set because they normalize to the same server/cache query.
- Global results can be logged directly or starred into `user_food_library`.
- A bounded ten-minute cache can paint recent global results immediately, but
  every explicit search revalidates with `no-store` so a catalog rollout cannot
  leave a live PWA session on stale results. Cache keys include user, normalized
  query, page, and page size; render-time ownership guards prevent account-switch
  data flashes.
- Result headings show the number loaded and the exact global match total.
  Stable 50-row pages expose **Load more** on both phone and web, so a 420- or
  515-item restaurant menu can be traversed instead of being silently truncated.
  Rows already in the personal library are excluded before the global page is
  cut, while the AI command path deliberately keeps them searchable.

The server is upgrade-aware. It prefers `search_foods_v4`, falls back to
`search_foods_hybrid`, then the lexical RPC, and finally a bounded legacy
name/brand/brand-slug search. Capability probes never spend an embedding call.
Semantic query embeddings require both `OPENAI_API_KEY` and the explicit
`FOOD_SEMANTIC_SEARCH_ENABLED=true` flag; leave that flag unset until a matching
catalog embedding backfill has actually completed.

The v2 base plus additive v3/v4 search migrations provide:

- one accent-folded, apostrophe-safe normalization contract with stored
  field-specific and compact identity text;
- weighted positional full-text search (brand/name A; aliases, compact identity,
  and variant B; category C; serving D) with active-only B-tree, GIN, and trigram
  indexes;
- indexed conjunctive and ordered token-prefix retrieval (`qd`, `qdob`, partial
  brands/items), exact identity tiers, compact-brand matching, and a
  fallback-only tokenwise typo lane;
- deterministic tier-first ranking so exact/prefix results cannot be displaced
  by fuzzy or semantic neighbors, plus exact totals and stable pagination;
- active-only HNSW cosine retrieval;
- optional semantic fallback beneath lexical tiers; and
- embedding model/input-hash/update metadata for invalidation and backfills.

Production search v3 was applied on 2026-07-11 after locking the prior function
and live counts in `rollout_backup_20260711_food_search_v3`. The function-only
rollout left all 2,437 foods, 2,332 active restaurant rows, 471 food logs, 99
personal-library links, 28 saved-meal item links, and import/provenance journals
unchanged. Authenticated checks as a synthetic future user returned only the
expected restaurant for `qd`, `qdob`, `chip`, `red rob`, `five g`, `taco b`,
and their brand/item prefix combinations; `chipotle` and `chipotle ` returned
identical IDs. A warm two-character prefix query completed in about 31 ms.

Production search v4 was applied on 2026-07-11 after a full transaction/rollback
rehearsal and a locked snapshot in
`rollout_backup_20260711_food_search_v4`. The snapshot stores all 2,437 prior
search rows, the v3 function, judged v3 results, and the live baseline: 2,332
active restaurant foods, 471 food logs, 99 personal-library links, 28 saved-meal
links, 11 import batches, 2,602 provenance rows, and 2,609 transitions. All
counts, food `updated_at` values, embedding metadata, import journals, and user
tables remained unchanged. The versioned relevance suite passes exact brands,
partial/compact brands, ordered item prefixes, trailing whitespace, and bounded
single/multi-token typos. A synthetic future user sees all 2,332 restaurant rows
and zero other-user manual rows; anonymous RPC execution is denied. Warm database
execution measured about 41 ms for a broad item query, 52 ms for `qd`, 100 ms for
the 420-row Red Robin browse, and 195 ms for multi-token typo recovery.

Manual-food and library writes prefer ownership-scoped v2 RPCs and fall back to
today's policies only while those RPCs are absent. Barcode foods are re-fetched
from Open Food Facts and persisted through `POST /api/food/barcode`, so the
browser cannot claim official provenance. That server-owned write requires
`SUPABASE_SERVICE_ROLE_KEY`. The AI food-command route also derives the user
from cookies and never accepts a caller-provided user ID.

## Mobile, iOS, and PWA conventions

- Use dynamic viewport units (`dvh`), not `100vh`.
- Use `<DialogContent fullscreenOnMobile>` for phone-sized dialog flows.
- Sticky headers/overlays account for both safe-area insets.
- The viewport uses `viewport-fit=cover`, preserves pinch zoom, and form inputs
  remain at least 16px on phones to avoid Safari focus zoom.
- Mobile navigation controls have larger touch targets; long food/meal names use
  `line-clamp-2 break-words` rather than `truncate`.
- `public/sw.js` caches only same-origin static assets. Navigation, auth, API,
  and user-data requests are network-only, preventing stale authenticated HTML
  after sign-out or deployment.
- Install on iOS from Safari. Chrome shortcuts do not receive the same
  standalone mode.

## Performance conventions

All five feature-tab bodies, the three library panels, settings, food/AI/preset
dialogs, the Quagga barcode scanner, Recharts detail UI, and date picker are
dynamically loaded behind interaction. Closed overlays are inert and do not
mount their data hooks. This removed the prior duplicate library/preset query
fan-out and cut initial uncompressed modern JavaScript by about 15.7% in the
production-build comparison.

Analytics loads its five independent datasets in parallel. The client cache is
bounded, global-search requests are cancellable, and food vectors are
server/database-only. Keep heavy dependencies behind dynamic boundaries and
filter already-loaded personal data with `useMemo`.

## Database rollout

SQL files are applied manually through the Supabase SQL editor. Production was
migrated on 2026-07-10 after a locked snapshot was captured in
`rollout_backup_20260710_1823`. The snapshot preserved 90 foods, 456 food logs,
90 personal-library links, 28 saved-meal item links, and the prior database
metadata. Three reviewed bundles then added 123 Chipotle, 147 Qdoba, and 515
Taco Bell foods.

Before the 2026-07-11 catalog expansion, a second locked snapshot was captured
in `rollout_backup_20260711_0031`: 875 foods, 456 food logs, 90 personal-library
links, 28 saved-meal item links, three import batches, 785 provenance rows, and
785 import transitions. That expansion and correction rollout produced
1,912 active restaurant foods across eight brands: 192 Arby's, 244 Burger King,
332 Chick-fil-A, 119 Chipotle, 325 Dairy Queen, 41 Five Guys, 144 Qdoba, and 515
Taco Bell. Ten immutable import batches retain 2,182 provenance rows and 2,189
transition rows. Seven excluded Chipotle/Qdoba rows are deliberately
quarantined as inactive, so they remain available to historical references but
cannot appear in active global search.

Immediately before the Red Robin import, the locked
`rollout_backup_20260711_red_robin_420` snapshot preserved 2,016 foods: 1,919
restaurant versions (1,912 active and seven inactive), 468 food logs, 97
personal-library links, 28 saved-meal item links, ten import batches, 2,182
provenance rows, and 2,189 import transitions. The approved 420-row Red Robin
bridge payload was 2,344,865 bytes with
`rpc_payload_sha256=eef9bd7c12afe24ba96637258fff32f40568a3905f084aac0294d6fdea7b1647`.
After import, production contains 2,436 foods: 2,339 restaurant versions with
2,332 active foods across nine brands, including 420 Red Robin foods, and seven
inactive quarantined rows. Eleven immutable import batches retain 2,602
provenance rows and 2,609 transition rows; food logs, personal-library links,
and saved-meal item links remain unchanged from the locked snapshot. Exact
replays of all eleven accepted bundles return `IDEMPOTENT_REPLAY` with zero
writes. Any personal-library link to a quarantined row is removed and journaled
by the importer.

The 2026-07-13 Bojangles rollout used the same guarded path. The locked
`rollout_backup_20260713_bojangles_149` snapshot preserved 2,443 foods (2,436
active), 2,339 restaurant versions (2,332 active), 485 food logs, 105
personal-library links, 28 saved-meal item links, eleven import batches, 2,602
provenance rows, and 2,609 transitions. The approved 149-row bridge payload was
445,254 bytes with
`rpc_payload_sha256=6fe8f37b67cd46e2bb91123cbed304bbab5ae24f3bbb7d54092cf23d03737e93`.
The import inserted exactly one batch, 149 immutable food versions, 149
provenance records, and no deactivations. Production now contains 2,592 foods
(2,585 active), 2,488 restaurant versions with 2,481 active foods across ten
brands, twelve batches, 2,751 provenance rows, and 2,758 transitions. The three
user-owned table snapshots were byte-for-byte unchanged, and an exact bundle
replay returned `IDEMPOTENT_REPLAY` with zero writes. Production search returned
all 149 Bojangles rows for `boj`, `bojan`, `bojangles`, and whitespace-padded
`bojangles `; `bo tato` and `cajun filet` placed the expected Bojangles item
first. The bundle hash allowlist is removed after this verification and the
closing deployment, so the import route is unavailable outside a reviewed
one-payload window.

The 2026-07-13 all-restaurants completion rollout imported every remaining
frontier-approved collector result. The locked
`rollout_backup_20260713_all_restaurants_37` snapshot preserved 2,592 foods
(2,585 active), 2,481 active restaurant foods and seven inactive quarantined
versions, 485 food logs, 105 personal-library links, 28 saved-meal item links,
12 batches, 2,751 provenance rows, and 2,758 transitions. Thirty-seven
individually hash-allowlisted bundles contained 10,921 complete active menu rows;
their transfer-set aggregate SHA-256 is
`e070be4b754b1afa9632bafdea5b061d1bb80606fb4e3f90aa81320fd44e08fe`.
Every per-chain payload remained below the four-MiB bridge limit.

Relative to that snapshot, the rollout added 8,440 immutable foods, 27 batches,
8,440 provenance rows, and 8,440 transitions with no deactivations. Production
now contains 11,032 foods (11,025 active), including exactly 10,921 active
restaurant foods across all 37 brands and seven deliberately inactive legacy
versions; it retains 39 batches, 11,191 provenance rows, and 11,198 transitions.
No baseline food row changed or disappeared, and food logs, personal-library
links, saved-meal item links, and the empty library-transition journal are
unchanged from the locked snapshot. A second bridge pass over all 37 bundles
returned `IDEMPOTENT_REPLAY` with zero catalog writes for every chain.

The replay audit found and fixed two receiver-domain mismatches without weakening
the immutable-content guard: cholesterol retains the live legacy unrestricted
`numeric` domain, and an empty optional source identifier canonicalizes to
`null`. Mismatch errors now identify the logical food identity and differing
field for operator diagnostics. Production search returned complete paginated
menus for partial and normalized queries including `qd`, `Qdob`, `chipotle `,
`red rob`, `starb`, `tacobell`, and `whatab`; database checks found zero chain
count mismatches, duplicate active identities, provenance orphans, or transition
orphans. The payload allowlist is removed for the closing deployment so the
bridge is unavailable until a future reviewed import window.

The 2026-07-22 Hawaiian Bros rollout extended the same evidence-bound path to
the current official February 2026 nutrition sheet. The locked
`rollout_backup_20260722_hawaiian_bros_63` snapshot preserved 11,047 foods,
10,928 restaurant versions (10,921 active and seven inactive), 587 food logs,
120 personal-library links, 28 saved-meal item links, 39 batches, 11,191
provenance rows, and 11,198 transitions. Of 71 printed source rows, 63 had a
complete, internally consistent nutrient record; three partial rows and five
source-printed carbohydrate/sugar contradictions remain explicitly excluded
rather than repaired or estimated. The approved bridge payload was 200,121
bytes with
`rpc_payload_sha256=134e637e07b315abf5026e7e589b389799568fd291b2e6a63f6f73b533304aa2`.

The atomic production import inserted one batch, 63 immutable food versions,
63 provenance rows, and 63 transitions with no deactivations. Production now
contains 11,110 foods, 10,991 restaurant versions, and 10,984 active restaurant
foods across 38 brands; it retains 40 batches, 11,254 provenance rows, and
11,261 transitions. Food logs, personal-library links, saved-meal item links,
and the library-transition journal changed by zero. An immediate exact replay
returned `IDEMPOTENT_REPLAY` with zero writes. Search verification returned all
63 Hawaiian Bros rows in two stable, non-overlapping pages for the exact and
whitespace/case-normalized brand query; `haw` placed Hawaiian Bros in all top
ten results, and `haw honolulu chick` ranked `Honolulu Chicken - Classic`
first. The one-payload allowlist was removed and the closing production
deployment restored HTTP 503 at the import route.

The 2026-07-22 six-chain second-wave rollout added Papa Johns, Freddy's
Frozen Custard & Steakburgers, Hardee's, Buffalo Wild Wings, Firehouse Subs,
and Noodles & Company through the same evidence-bound bridge. The locked
`rollout_backup_20260722_second_wave_6` snapshot preserved 11,110 foods,
10,991 restaurant versions (10,984 active and seven inactive), 588 food logs,
120 personal-library links, 28 saved-meal item links, 40 import batches,
11,254 provenance rows, 11,261 transitions, and the empty library-transition
journal. Schema access is revoked from `anon`, `authenticated`, and
`service_role`.

The six separately validated payloads stayed below the four-MiB bridge cap:
480 Papa Johns rows (`1,552,692` bytes,
`12c80b52c79234ed5527a9addae4689e301ca3643fe1fcbdf69a41f31d4ca038`),
301 Freddy's rows (`910,906` bytes,
`c3b06b765259a3cddae2a67776b5346902f0bb01b8d111b384d2dad51a0d451b`),
126 Hardee's rows (`375,011` bytes,
`31e44e8073e311486787fc66bf51c86e7851ac3725f1901b7217f953435e1a99`),
747 Buffalo Wild Wings rows (`2,151,336` bytes,
`ebd70849e170c51118f72d7008fe8b73bfc3cce235a1af8d997890132618a07c`),
1,092 Firehouse Subs rows (`2,975,218` bytes,
`6e64e574063bdf468889c80f55eefafbaf00114ae227b27580a7e8bcfb5b07f9`),
and 64 Noodles & Company rows (`198,659` bytes,
`98dfc32240d409ae662bbb99fb86a0da0a1d851583e1395381bdc8cc4cf0aad9`).

The atomic imports added exactly six batches, 2,810 immutable food versions,
2,810 provenance rows, and 2,810 activation transitions with no deactivations.
Production now contains 13,920 foods, 13,801 restaurant versions, and 13,794
active restaurant foods across 44 brands; it retains 46 batches, 14,064
provenance rows, and 14,071 transitions. Food logs, personal-library links,
saved-meal item links, and the library-transition journal changed by zero.
Exact replays of all six payloads returned `IDEMPOTENT_REPLAY` with zero
writes. Database checks found zero duplicate active identities, incomplete
core macros, missing search fields, provenance orphans, or transition orphans.
Partial brand searches (`papa`, `fredd`, `hardee`, `buffalo wild`,
`firehouse`, and `noodles`) placed the correct brand first, brand-plus-item
queries placed the intended food first, and Firehouse pagination returned two
50-row pages with a stable total of 1,092 and zero overlap. The temporary
six-hash allowlist was removed for the closing deployment, restoring HTTP 503
at the import route.

Embedding generation is deliberately deferred for this rollout. Production
search remains available through the indexed lexical side of the hybrid RPC.
Do not treat embeddings as complete until the bounded backfill below is
intentionally resumed and finishes without failures.

For a fresh environment, take a database backup and complete a non-production
rehearsal before applying the five SQL files in the order below. For subsequent
whole-chain snapshots, the migrations are already present: begin at the dry run,
add only the reviewed payload hash, and import through the bridge.

Dry-run the approved bundle to obtain its `rpc_payload_sha256`. Configure Vercel
Production with `RESTAURANT_IMPORT_SECRET`,
`RESTAURANT_IMPORT_ALLOWED_SHA256=<that hash>`, `CRON_SECRET`,
`SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY`. Multiple approved payload
hashes may be comma-separated. None of these secrets may use a `NEXT_PUBLIC_`
prefix. Then run `npm run check`, push the reviewed code, wait for Vercel, and
use this fresh-environment order without another frontend push until the
post-import checks finish:

1. Apply `sql/add_vector_search.sql`.
2. Apply `sql/add_restaurant_food_import.sql`.
3. Apply `sql/add_food_search_v2.sql`.
4. Apply `sql/add_food_search_v3.sql`.
5. Apply `sql/add_food_search_v4.sql`, then run the read-only
   `sql/verify_food_search_v4.sql` suite.
6. Repeat `npm run import-restaurant-foods -- <bundle-directory>` and confirm
   the counts and hash are unchanged.
7. Use the Vercel bridge command below to import without placing the Supabase
   service-role key on the collector/operator machine.
8. Verify exact returned counts and search several imported foods.
9. Run the bounded Vercel embedding loop only when semantic search is deliberately
   resumed; enable `FOOD_SEMANTIC_SEARCH_ENABLED=true` after coverage is complete.
10. Repeat authenticated food-search and food-log smoke tests in production.
11. Remove `RESTAURANT_IMPORT_ALLOWED_SHA256` and redeploy so the bridge returns
   unavailable outside a reviewed, one-payload import window.

The v2 migration adds indexed hybrid search, safe manual/library RPCs, restricted
catalog writes, and a guarded ownership backfill. Each legacy manual food is
assigned only when its library links identify exactly one distinct user;
ambiguous and unlinked rows stay unowned. Configure
`SUPABASE_SERVICE_ROLE_KEY` first so barcode persistence and the restaurant
importer continue after direct catalog writes are revoked.

Restaurant refreshes insert a new immutable nutrient row, deactivate the prior
version, and preserve historical `food_logs`. Provenance remains linked through
`food_import_batches` and `food_provenance`.

## Restaurant nutrition offline gate

The Prometheus collector emits `health-tracker-restaurant-foods-v1` only for
fully approved jobs with complete frontier row coverage. Validate a copied
bundle without database access:

```bash
npm run validate-restaurant-import -- <bundle-directory>
```

The validator checks an exact schema, every declared SHA-256, clean PASS audits,
row counts, nutrient/content hashes, active/version uniqueness, and one-to-one
evidence links. It cannot write Supabase. The import command is also a dry run
unless an apply flag is explicitly present; validation completes before it loads
any credentials. These unkeyed SHA-256 values detect changes but are not digital
signatures or authentication: the workflow assumes a trusted local collector,
bundle origin, and transfer path. The production bridge adds separate bearer
authorization and an exact-body hash allowlist.

For production, keep only the Vercel endpoint and its dedicated import secret in
the operator environment, then use the bridge mode:

```powershell
$env:RESTAURANT_IMPORT_URL = "https://<production-domain>/api/admin/restaurant-import"
$env:RESTAURANT_IMPORT_SECRET = "<same-dedicated-secret-configured-in-vercel>"
npm run import-restaurant-foods -- <bundle-directory> --apply-via-vercel
```

`POST /api/admin/restaurant-import` accepts only an exact, timing-safe
`Authorization: Bearer $RESTAURANT_IMPORT_SECRET` match and an uncompressed JSON
body with a valid `Content-Length`. Before parsing, it hashes the exact received
bytes and requires that digest in `RESTAURANT_IMPORT_ALLOWED_SHA256`. A leaked
bearer can therefore replay only an explicitly approved payload, and exact replay
is a zero-write database operation. Both declared and received body sizes are
capped at 4 MiB. A larger multi-chain transfer may be split only at whole-chain
batch boundaries: every batch is a complete chain snapshot, and splitting one
chain would make omitted items look deleted and deactivate them. All 37 current
accepted per-chain batch payloads fit individually. The route never logs or
returns the secret, hash, or request payload, disables caching, calls the
service-role RPC exactly once, and returns only its result or a bounded public
error.

The direct `--apply` mode remains available for a controlled local rehearsal,
but requires a local `SUPABASE_SERVICE_ROLE_KEY` and is not the production
default. Both apply modes call `import_restaurant_food_bundle` exactly once.
That RPC is executable only by `service_role`, caps bundle/row sizes, rechecks
the contract, and commits batches, immutable food versions, active-version
transitions, and provenance in one transaction. Replaying the same bundle
returns `IDEMPOTENT_REPLAY` with zero mutations. A changed value under an
existing batch/version key is rejected.

Contract-v1 operator rule: `content_hash` covers serving and the core mapped
nutrients. A change to grams, optional nutrients, or display metadata under the
same source identity/hash is deliberately rejected by the full-row collision
check. That rejection is not an outage to bypass; it requires a contract-v2
definition and a regenerated, revalidated bundle. The receiver canonicalizes
`serving_size_grams` to live `numeric(10,2)`, cholesterol to its legacy
unrestricted `numeric` domain, and all other persisted nutrition values to live
`numeric(8,2)` before both insertion and immutable replay comparison. Optional
source identifiers also canonicalize a legacy empty string to `null`, so the two
representations of "not supplied" replay identically while non-empty identifiers
remain immutable.
Sub-0.01 precision is intentionally outside those catalog columns; retain the
approved transfer bundle as the exact source artifact.

## Production embedding backfill

The production embedding route uses the already-configured Vercel OpenAI and
Supabase service-role keys. The operator machine needs only `CRON_SECRET`:

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

Each no-body POST selects at most 100 active foods missing current-model
metadata, sends one batched OpenAI request, and updates with concurrency 10 plus
an `updated_at` stale-write guard. Responses contain only
`scanned/updated/changed/failed/has_more`; food names and vectors are never
logged or returned. Canonical-field edits clear vector metadata through the SQL
trigger, making the row eligible again. `npm run generate-embeddings` remains a
local rehearsal tool when all three privileged keys are intentionally local.

For an operational rollback after a successful import, stop imports and
embedding generation, then restore the dated pre-import backup through the
tested Supabase recovery process. Do not improvise food activation, deletion, or
library-link SQL in production. The only alternative is a separately built and
rehearsed journal-driven rollback that consumes both immutable
`food_import_transitions` and `food_import_library_transitions`, verifies the
complete post-rollback state, and has passed on a restored backup first. Until
that procedure exists, backup restore is the supported data rollback. Revert
application code separately with Git; do not drop live migration objects as a
routine rollback.

## Development and verification

```bash
npm run dev
npm run lint
npm run test:unit
npm run typecheck
npm run build
npm run check        # lint + unit + typecheck + production build
```

The complete dependency tree passes `npm audit` with zero advisories. Next and
`eslint-config-next` are pinned to 16.2.10; npm overrides enforce compatible
PostCSS/ws security floors.

The React 19 `set-state-in-effect` rule remains an error for components and is
scoped to warning severity in `src/hooks/**/*.ts`. The current lint run is clean;
the next bounded data-layer task is still to move legacy hooks to one shared
cancellable query layer rather than independently recreating that machinery.

Environment variables live in `.env.local`: Supabase URL/anon key, server-only
service role, optional OpenAI key, Whoop OAuth, cron secret, and USDA key. Never
give service-role or OpenAI secrets a `NEXT_PUBLIC_` prefix.

See `docs/VECTOR-SEARCH-SETUP.md`, `NOTES_food_database_plan.md`,
`NOTES_daily_summary_feature.md`, and `PLAN_multi_user_transition.md` for deeper
domain notes.
