-- Body measurements: weight and anything else measured about the body.
--
-- Nothing stored body weight before this, so calorie data had no feedback loop
-- and the most actionable thing nutrition data can say -- surplus/deficit and
-- real TDEE -- could not be said at all.
--
-- Design notes:
--  * ONE table with a `metric` discriminator rather than a weight-specific
--    table. A smart scale also reports body fat, lean mass and BMI, and adding
--    those must not need a schema change (the lesson from replacing the 15
--    one-table-per-supplement designs with user_tracked_items).
--  * `measured_at` is a TIMESTAMPTZ, not a date: multiple weigh-ins in a day
--    are real and differ, and morning-fasted is not the same number as evening.
--    Consumers pick the first reading of the day.
--  * `source` because several feeds genuinely disagree (a scale app, Apple
--    Health, WHOOP, manual entry), and a later migration to a different feed
--    must not silently rewrite history.
--  * UNIQUE (user_id, metric, measured_at, source) makes re-import a zero-write
--    replay, the same idempotency the restaurant importer relies on.
--  * Weight is stored canonically in POUNDS. Every existing record in the
--    owner's Apple Health export is already lb; WHOOP reports kilograms and is
--    converted at ingest so one metric never mixes units.

CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT body_measurements_unique_reading
    UNIQUE (user_id, metric, measured_at, source)
);

CREATE INDEX IF NOT EXISTS body_measurements_user_metric_time_idx
  ON body_measurements (user_id, metric, measured_at DESC);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'body_measurements'
      AND policyname = 'Users can view their own body measurements'
  ) THEN
    CREATE POLICY "Users can view their own body measurements"
      ON body_measurements FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'body_measurements'
      AND policyname = 'Users can insert their own body measurements'
  ) THEN
    CREATE POLICY "Users can insert their own body measurements"
      ON body_measurements FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'body_measurements'
      AND policyname = 'Users can update their own body measurements'
  ) THEN
    CREATE POLICY "Users can update their own body measurements"
      ON body_measurements FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'body_measurements'
      AND policyname = 'Users can delete their own body measurements'
  ) THEN
    CREATE POLICY "Users can delete their own body measurements"
      ON body_measurements FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Verification (returns rows, rather than RAISE NOTICE which the Supabase SQL
-- editor does not display).
SELECT 'body_measurements' AS table_name,
       (SELECT count(*) FROM pg_policies WHERE tablename = 'body_measurements') AS policy_count,
       (SELECT relrowsecurity FROM pg_class WHERE relname = 'body_measurements') AS rls_enabled;
