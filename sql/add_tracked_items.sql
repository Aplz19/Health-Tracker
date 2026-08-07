-- Supplements/medications: 15 one-table-per-supplement designs -> one generic
-- item table + one log table (the shape habits v2 already proved).
--
-- See NOTES_supplements_medications_migration.md for the reasoning.
--
-- SAFETY:
--   * Purely additive. Creates two tables and COPIES data into them.
--   * The 15 legacy *_logs tables and user_supplement_preferences are left
--     completely untouched — no drops, no updates, no deletes.
--   * Idempotent: re-running copies nothing twice (ON CONFLICT DO NOTHING).
--   * Verify with the queries at the bottom BEFORE relying on it.
--
-- ROLLBACK: DROP TABLE tracked_item_logs, user_tracked_items;
--           (the legacy tables still hold everything)

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_tracked_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 'supplement' | 'medication'. Same machinery, different UI section and
  -- different meaning to any analysis reading the data.
  kind TEXT NOT NULL CHECK (kind IN ('supplement', 'medication')),

  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'mg',

  -- Amount taken per dose (e.g. 100 for a 100 mg tablet). The daily checkbox
  -- writes dose_amount * doses_taken into the log row.
  dose_amount NUMERIC,

  -- Doses per day; the UI renders this many checkboxes. 0 = as-needed.
  doses_per_day INTEGER NOT NULL DEFAULT 1,

  -- "Am I currently taking this." Disabling hides it from today's list and
  -- NEVER deletes history.
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Supplements keep the existing manual/goal behaviour; medications are
  -- always 'goal' (checkbox logs the configured dose).
  tracking_mode TEXT NOT NULL DEFAULT 'goal'
    CHECK (tracking_mode IN ('manual', 'goal')),
  goal_amount NUMERIC,

  sort_order INTEGER NOT NULL DEFAULT 999,

  -- Which SUPPLEMENT_DEFINITIONS key this came from, so the backfill is
  -- idempotent and legacy rows can be traced. NULL for user-created items.
  legacy_key TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, kind, name)
);

CREATE INDEX IF NOT EXISTS idx_user_tracked_items_user
  ON user_tracked_items(user_id, kind, sort_order);

CREATE TABLE IF NOT EXISTS tracked_item_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES user_tracked_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- The amount ACTUALLY taken that day, snapshotted at log time. Nothing may
  -- ever recompute this from current settings — that invariant is what makes
  -- the logs themselves the dose history.
  amount NUMERIC NOT NULL DEFAULT 0,

  -- How many of the day's scheduled doses were taken.
  doses_taken INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (item_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tracked_item_logs_user_date
  ON tracked_item_logs(user_id, date);

-- ---------------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------------

ALTER TABLE user_tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_item_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tracked_items_own ON user_tracked_items;
CREATE POLICY user_tracked_items_own ON user_tracked_items
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS tracked_item_logs_own ON tracked_item_logs;
CREATE POLICY tracked_item_logs_own ON tracked_item_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) Backfill from the 15 legacy tables
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  d record;
BEGIN
  FOR d IN
    SELECT * FROM (VALUES
      ('creatine',        'creatine_logs',           'Creatine',     'g',    5),
      ('fishOil',         'fish_oil_logs',           'Fish Oil',     'mg',   2000),
      ('d3',              'd3_logs',                 'Vitamin D3',   'IU',   5000),
      ('k2',              'k2_logs',                 'Vitamin K2',   'mcg',  100),
      ('vitaminC',        'vitamin_c_logs',          'Vitamin C',    'mg',   1000),
      ('vitaminA',        'vitamin_a_logs',          'Vitamin A',    'IU',   5000),
      ('vitaminE',        'vitamin_e_logs',          'Vitamin E',    'IU',   400),
      ('vitaminB12',      'vitamin_b12_logs',        'Vitamin B12',  'mcg',  1000),
      ('vitaminBComplex', 'vitamin_b_complex_logs',  'B Complex',    'mg',   100),
      ('folate',          'folate_logs',             'Folate',       'mcg',  400),
      ('biotin',          'biotin_logs',             'Biotin',       'mcg',  5000),
      ('zinc',            'zinc_logs',               'Zinc',         'mg',   15),
      ('magnesium',       'magnesium_logs',          'Magnesium',    'mg',   400),
      ('melatonin',       'melatonin_logs',          'Melatonin',    'mg',   3),
      ('caffeine',        'caffeine_logs',           'Caffeine',     'mg',   200)
    ) AS t(key, tbl, label, unit, default_goal)
  LOOP
    IF to_regclass('public.' || quote_ident(d.tbl)) IS NULL THEN
      RAISE NOTICE 'skip (no such table): %', d.tbl;
      CONTINUE;
    END IF;

    -- One item per user who has either a preference or any logged data.
    EXECUTE format($f$
      INSERT INTO user_tracked_items
        (user_id, kind, name, unit, dose_amount, doses_per_day, is_enabled,
         tracking_mode, goal_amount, sort_order, legacy_key)
      SELECT u.user_id,
             'supplement',
             %L,
             %L,
             COALESCE(p.goal_amount, %L),
             1,
             COALESCE(p.is_enabled, FALSE),
             COALESCE(p.tracking_mode, 'manual'),
             COALESCE(p.goal_amount, %L),
             COALESCE(p.sort_order, 999),
             %L
      FROM (
        SELECT DISTINCT user_id FROM public.%I
        UNION
        SELECT user_id FROM public.user_supplement_preferences WHERE supplement_key = %L
      ) u
      LEFT JOIN public.user_supplement_preferences p
        ON p.user_id = u.user_id AND p.supplement_key = %L
      ON CONFLICT (user_id, kind, name) DO NOTHING
    $f$, d.label, d.unit, d.default_goal, d.default_goal, d.key,
         d.tbl, d.key, d.key);

    -- Copy every log row. amount is carried across verbatim.
    EXECUTE format($f$
      INSERT INTO tracked_item_logs (user_id, item_id, date, amount, doses_taken)
      SELECT l.user_id,
             i.id,
             l.date,
             l.amount,
             CASE WHEN l.amount > 0 THEN 1 ELSE 0 END
      FROM public.%I l
      JOIN user_tracked_items i
        ON i.user_id = l.user_id
       AND i.legacy_key = %L
       AND i.kind = 'supplement'
      ON CONFLICT (item_id, date) DO NOTHING
    $f$, d.tbl, d.key);

    RAISE NOTICE 'migrated: %', d.label;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4) VERIFY — old vs new must match before trusting this
-- ---------------------------------------------------------------------------

-- Per-supplement row counts and date ranges, legacy vs migrated.
-- Every row should show equal counts and identical first/last days.
DO $$
DECLARE
  d record;
  legacy_count bigint;
  legacy_min date;
  legacy_max date;
  new_count bigint;
  new_min date;
  new_max date;
BEGIN
  RAISE NOTICE '% | % | % | %', rpad('supplement', 14), 'legacy', 'migrated', 'match';
  FOR d IN
    SELECT * FROM (VALUES
      ('creatine','creatine_logs','Creatine'),
      ('fishOil','fish_oil_logs','Fish Oil'),
      ('d3','d3_logs','Vitamin D3'),
      ('k2','k2_logs','Vitamin K2'),
      ('vitaminC','vitamin_c_logs','Vitamin C'),
      ('vitaminA','vitamin_a_logs','Vitamin A'),
      ('vitaminE','vitamin_e_logs','Vitamin E'),
      ('vitaminB12','vitamin_b12_logs','Vitamin B12'),
      ('vitaminBComplex','vitamin_b_complex_logs','B Complex'),
      ('folate','folate_logs','Folate'),
      ('biotin','biotin_logs','Biotin'),
      ('zinc','zinc_logs','Zinc'),
      ('magnesium','magnesium_logs','Magnesium'),
      ('melatonin','melatonin_logs','Melatonin'),
      ('caffeine','caffeine_logs','Caffeine')
    ) AS t(key, tbl, label)
  LOOP
    IF to_regclass('public.' || quote_ident(d.tbl)) IS NULL THEN CONTINUE; END IF;

    EXECUTE format('SELECT count(*), min(date), max(date) FROM public.%I', d.tbl)
      INTO legacy_count, legacy_min, legacy_max;

    SELECT count(*), min(l.date), max(l.date)
      INTO new_count, new_min, new_max
      FROM tracked_item_logs l
      JOIN user_tracked_items i ON i.id = l.item_id
     WHERE i.legacy_key = d.key AND i.kind = 'supplement';

    IF legacy_count > 0 OR new_count > 0 THEN
      RAISE NOTICE '% | % rows -> % rows | dates %..% -> %..% | %',
        rpad(d.label, 14), legacy_count, new_count,
        legacy_min, legacy_max, new_min, new_max,
        CASE WHEN legacy_count = new_count
              AND legacy_min IS NOT DISTINCT FROM new_min
              AND legacy_max IS NOT DISTINCT FROM new_max
             THEN 'OK' ELSE '*** MISMATCH ***' END;
    END IF;
  END LOOP;
END $$;

-- Dose history survived: this should reproduce the legacy d3_logs breakdown
-- (5000 for 23 days Jan..Jun, 10000 for 13 days Jun..Aug).
SELECT i.name, l.amount, count(*) AS days,
       min(l.date) AS first_day, max(l.date) AS last_day
FROM tracked_item_logs l
JOIN user_tracked_items i ON i.id = l.item_id
WHERE i.legacy_key = 'd3'
GROUP BY i.name, l.amount
ORDER BY first_day;
