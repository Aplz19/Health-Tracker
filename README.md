# Health Tracker

Personal health-tracking PWA: diet/macros, workouts, supplements, habits, and
Whoop (recovery/sleep/strain) in one place, with data stored in an
AI-analysis-friendly shape (`daily_summaries`). Built by/for the owner,
multi-user-ready underneath.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind 4** + shadcn/Radix UI primitives (`src/components/ui`)
- **Supabase** — Postgres + Auth + RLS; browser client in `src/lib/supabase`
- **PWA** — installable on iOS (install from **Safari**; Chrome shortcuts don't
  get standalone mode), manifest + icons in `public/`
- Whoop OAuth sync (`src/app/api/whoop/*`, Vercel cron), Open Food Facts
  barcode lookups, food embeddings for semantic search
- Deployed on **Vercel**; pushing `main` deploys production

## Layout

```
src/
├── app/            Routes: page.tsx (SPA shell), login/signup, api/* routes
├── components/     Feature components (tabs/, meals/, food/, workout/, ...)
│   └── ui/         shadcn-style primitives (dialog, sheet, button, ...)
├── contexts/       Auth, date, app overlays, per-user preference contexts
├── hooks/          Data hooks — one per table/domain, Supabase + cache
└── lib/            supabase/, whoop/, openfoodfacts/, client-cache, utils
sql/                One-off migrations — run manually in the Supabase SQL editor
```

## Data-layer conventions (read before adding a hook)

These patterns exist deliberately — new code should follow them:

1. **Session, not user.** Client hooks call `supabase.auth.getSession()`
   (local, instant) instead of `auth.getUser()` (network round-trip). RLS
   enforces per-user security regardless. API routes still verify server-side.
2. **Session cache (stale-while-revalidate).** `src/lib/client-cache.ts` is a
   module-scope Map. Hooks seed state from it (`getCached`), only show a
   loading state when nothing is cached (`hasCached`), write every state
   change through to it (a wrapped `setX` that calls `setCached`), and
   revalidate in the background on mount/date change. This is why switching
   tabs/dates is instant after first visit. Cleared on sign-out.
3. **Gate unused queries.** Hooks that must be instantiated unconditionally
   (rules of hooks) accept an `enabled` flag and skip fetching when off — see
   `useSupplement` (15 instances on the dietary tab, only enabled ones query).
4. **Optimistic mutations.** Mutations update local state (and via the
   write-through setter, the cache) immediately, then sync to Supabase.
5. **Per-user, not per-device.** User settings live in Supabase tables
   (e.g. `user_nutrition_goals`), *not* bare localStorage — localStorage is
   per-browser and desyncs across devices. It's acceptable only as a cache
   (see `use-nutrition-goals.ts`).
6. **Personal-first food search.** Typing in the meal food picker filters the
   session-cached personal library only, so it stays instant and makes no database
   request per keystroke. Pressing Enter (or the globe button on mobile) explicitly
   calls the global-food RPC. Global results may be logged directly; starring one
   adds only its `user_food_library` link. Recent global query results are held in
   the same session cache.
7. **Brand is structured.** `foods.name` is the item name and nullable `brand` is
   the manufacturer/restaurant. Search covers both plus aliases, while the UI omits
   the brand line cleanly for unbranded custom foods; the manual-food form exposes
   brand as an optional field. `source` remains provenance
   (`manual`, `openfoodfacts`, `restaurant_official`, etc.), not a display brand.

## Mobile/iOS conventions

- **Heights:** use `dvh` (`min-h-dvh`, `h-[100dvh]`, `max-h-[85dvh]`) — never
  `100vh`, which is clipped by the iOS URL bar / home indicator.
- **Full-screen dialogs:** `<DialogContent fullscreenOnMobile>` gives a
  full-screen sheet on phones and a centered card on `sm+`. Layout inside is
  sticky header / scrolling body / pinned footer. See
  `src/components/meals/README.md` for details.
- **Safe areas:** bottom sheets and pinned footers pad with
  `env(safe-area-inset-bottom)`.
- **No input zoom:** a global CSS rule (`globals.css`) forces form fields to
  ≥16px on phones so iOS Safari doesn't zoom on focus. Don't undo it with
  inline font sizes on inputs.
- **Never `truncate` food/meal names** — use `line-clamp-2 break-words`
  (names must stay readable; MFP-length product names are common).

## Performance conventions

- Heavy, rarely-used components are dynamically imported so they stay out of
  the main bundle: the barcode scanner (`quagga2`), the metric detail sheet
  (sole consumer of `recharts`), and the date-picker calendar
  (`react-day-picker`). Follow this pattern for any new heavy dependency that
  renders behind a click.
- `next.config.ts`: `optimizePackageImports` for lucide-react/date-fns/recharts;
  `console.*` stripped in production (error/warn kept).
- Context providers memoize their `value` (and callbacks) so consumers don't
  re-render on unrelated state.
- Search-over-loaded-data filters in memory (`useMemo`), not by refetching —
  see `useUserFoodLibrary`.

## Database changes

Schema changes are plain SQL files in `sql/`, applied manually via the
Supabase dashboard SQL editor (there is no migration runner). Follow the
existing files' style: `CREATE TABLE IF NOT EXISTS`, enable RLS, add
per-user policies. Pending: `add_nutrition_goals.sql` (goals sync).

`sql/add_restaurant_food_import.sql` is intentionally **staged but unapplied**.
It adds brand-aware global search, immutable restaurant-food version fields,
`food_import_batches`, and row-level `food_provenance`. Authoritative refreshes
insert a new food row and deactivate the prior version instead of changing
nutrition underneath historical `food_logs`.

## Restaurant nutrition transfer (offline gate)

The Prometheus nutrition pipeline emits the
`health-tracker-restaurant-foods-v1` bundle only from fully approved jobs with
complete frontier row coverage. Validate a copied bundle without database access:

```bash
npm run validate-restaurant-import -- <bundle-directory>
```

The validator checks file hashes, row counts, audit coverage, numeric mappings,
version-key/active-identity uniqueness, and evidence linkage. It has no Supabase client and cannot
write the database. Do not apply `add_restaurant_food_import.sql`, create an admin
importer, or deploy the brand/global-search UI until the offline bundle review is
accepted.

## Development

```bash
npm run dev    # dev server on :3000
npm run build  # production build + typecheck — run before pushing
npm run lint
```

Env lives in `.env.local` (Supabase URL/anon key, Whoop OAuth, cron secret,
USDA key). In-repo design docs: `NOTES_food_database_plan.md`,
`NOTES_daily_summary_feature.md`, `PLAN_multi_user_transition.md`, etc.
