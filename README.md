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

## Food discovery model

The meal picker follows the intended personal-first interaction:

- Typing filters the session-cached personal library only. There is no network
  request per keystroke.
- Enter or the globe button calls authenticated `GET /api/food/search`.
- The client aborts stale requests and accepts only the latest response.
- Global results can be logged directly or starred into `user_food_library`.
- Global query results use a bounded ten-minute cache.

The server is upgrade-aware. It uses `search_foods_hybrid` when the v2 SQL is
installed, the current lexical RPC during rollout, and a bounded legacy name
search as a final compatibility path. It first probes capability without paying
for an embedding, and remains lexical when `OPENAI_API_KEY` is absent.

The target v2 search in `sql/add_food_search_v2.sql` provides:

- stored normalized lexical text with active-only GIN/trigram indexes;
- active-only HNSW cosine retrieval;
- independent lexical and semantic candidates merged by reciprocal rank fusion;
- exact lexical dominance plus a small `auth.uid()` library tie-break; and
- embedding model/input-hash/update metadata for invalidation and backfills.

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

SQL files are applied manually through the Supabase SQL editor. The restaurant
and search migrations are intentionally **staged and unapplied**. The app works
against today's schema through compatibility paths; no Supabase change is
required to ship the frontend/runtime improvements.

After taking a database backup and completing a non-production rehearsal, use
this production order. Do not push the frontend between steps 2 and 5:

1. `sql/add_vector_search.sql`
2. `sql/add_restaurant_food_import.sql`
3. `sql/add_food_search_v2.sql`
4. `npm run import-restaurant-foods -- <bundle-directory>` (mandatory dry run)
5. `npm run import-restaurant-foods -- <bundle-directory> --apply`
6. Verify exact returned counts and search several imported foods.
7. `npm run generate-embeddings`
8. Run `npm run check`, then push the reviewed commit to deploy through Vercel.

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
unless `--apply` is explicitly present; validation completes before it loads any
credentials.

With `--apply`, the CLI requires the server-only `SUPABASE_SERVICE_ROLE_KEY` and
calls `import_restaurant_food_bundle` exactly once. That RPC is executable only
by `service_role`, caps bundle/row sizes, rechecks the contract, and commits
batches, immutable food versions, active-version transitions, and provenance in
one transaction. Replaying the same bundle returns `IDEMPOTENT_REPLAY` with zero
mutations. A changed value under an existing batch/version key is rejected.

For an operational rollback after a successful import, first stop import jobs,
then in one reviewed transaction deactivate only the affected batch's currently
active food IDs and reactivate their non-null `supersedes_food_id` rows. Keep
`food_import_batches`, `food_provenance`, and any food rows referenced by
`food_logs`; those are the immutable audit/history trail. Roll back application
code with a normal Git revert. Do not drop the new columns/tables from a live
database as a routine rollback.

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
