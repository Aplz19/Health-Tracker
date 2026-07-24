-- Enable Row Level Security + per-user policies on the tables that were
-- created via the Supabase dashboard (before this sql/ folder existed) and
-- therefore may still be unprotected.
--
-- SAFETY PROPERTIES:
--   * Touches NO data. Only ALTER TABLE ... ENABLE RLS and CREATE POLICY.
--     No INSERT / UPDATE / DELETE / DROP TABLE anywhere in this file.
--   * Idempotent. Safe to run repeatedly; policies are dropped-if-exists then
--     recreated, so re-running converges to the same state.
--   * Skips tables that don't exist and tables without a user_id column,
--     instead of erroring out.
--   * The service_role key BYPASSES RLS, so the Vercel cron jobs
--     (daily-sync / whoop-sync) keep working unchanged.
--
-- RUN sql/audit_rls.sql FIRST. If it reports rows with user_id IS NULL, those
-- rows will become invisible to the app after this runs (they are not deleted;
-- they simply belong to no user). Assign them an owner first.
--
-- ROLLBACK for any table:
--   ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 1) Strictly per-user tables: a row is visible only to the user who owns it.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  user_scoped text[] := ARRAY[
    -- core logging
    'meals', 'food_logs', 'daily_summaries', 'user_profiles',
    -- workouts
    'exercise_logs', 'workout_sessions', 'treadmill_sessions',
    -- whoop
    'whoop_tokens', 'whoop_data', 'whoop_workouts',
    -- habits / notes
    'habit_logs', 'daily_notes', 'user_habits', 'user_habit_preferences',
    -- preferences
    'user_supplement_preferences', 'user_analytics_preferences',
    'user_nutrition_goals',
    -- supplements (ad-hoc + all daily-tracked tables)
    'supplement_logs',
    'creatine_logs', 'd3_logs', 'k2_logs', 'vitamin_c_logs', 'zinc_logs',
    'magnesium_logs', 'melatonin_logs', 'caffeine_logs', 'fish_oil_logs',
    'vitamin_a_logs', 'vitamin_e_logs', 'vitamin_b12_logs',
    'vitamin_b_complex_logs', 'folate_logs', 'biotin_logs'
  ];
BEGIN
  FOREACH t IN ARRAY user_scoped LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'skip (no such table): %', t;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'user_id'
    ) THEN
      RAISE NOTICE 'skip (no user_id column): %', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)',
      t || '_select_own', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)',
      t || '_insert_own', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)',
      t || '_update_own', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)',
      t || '_delete_own', t);

    RAISE NOTICE 'secured (per-user): %', t;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) exercises — SHARED library.
--    The app lists exercises without filtering by user_id, and built-in
--    exercises may have user_id IS NULL. So: everyone may READ every exercise,
--    but may only modify their own. A strict per-user policy here would make
--    the whole exercise library disappear from the app.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.exercises') IS NULL THEN
    RAISE NOTICE 'skip (no such table): exercises';
    RETURN;
  END IF;

  ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS exercises_read_all ON public.exercises;
  CREATE POLICY exercises_read_all
    ON public.exercises FOR SELECT TO authenticated
    USING (true);

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'exercises' AND column_name = 'user_id'
  ) THEN
    DROP POLICY IF EXISTS exercises_insert_own ON public.exercises;
    CREATE POLICY exercises_insert_own
      ON public.exercises FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS exercises_update_own ON public.exercises;
    CREATE POLICY exercises_update_own
      ON public.exercises FOR UPDATE TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

    DROP POLICY IF EXISTS exercises_delete_own ON public.exercises;
    CREATE POLICY exercises_delete_own
      ON public.exercises FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  RAISE NOTICE 'secured (shared read / own write): exercises';
END $$;

-- ---------------------------------------------------------------------------
-- 3) exercise_sets — child rows with no user_id of their own.
--    Ownership is inherited through the parent exercise_logs row.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.exercise_sets') IS NULL
     OR to_regclass('public.exercise_logs') IS NULL THEN
    RAISE NOTICE 'skip (missing table): exercise_sets / exercise_logs';
    RETURN;
  END IF;

  ALTER TABLE public.exercise_sets ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS exercise_sets_select_via_parent ON public.exercise_sets;
  CREATE POLICY exercise_sets_select_via_parent
    ON public.exercise_sets FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.exercise_logs l
       WHERE l.id = exercise_sets.log_id AND l.user_id = auth.uid()));

  DROP POLICY IF EXISTS exercise_sets_insert_via_parent ON public.exercise_sets;
  CREATE POLICY exercise_sets_insert_via_parent
    ON public.exercise_sets FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM public.exercise_logs l
       WHERE l.id = exercise_sets.log_id AND l.user_id = auth.uid()));

  DROP POLICY IF EXISTS exercise_sets_update_via_parent ON public.exercise_sets;
  CREATE POLICY exercise_sets_update_via_parent
    ON public.exercise_sets FOR UPDATE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.exercise_logs l
       WHERE l.id = exercise_sets.log_id AND l.user_id = auth.uid()));

  DROP POLICY IF EXISTS exercise_sets_delete_via_parent ON public.exercise_sets;
  CREATE POLICY exercise_sets_delete_via_parent
    ON public.exercise_sets FOR DELETE TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.exercise_logs l
       WHERE l.id = exercise_sets.log_id AND l.user_id = auth.uid()));

  RAISE NOTICE 'secured (via parent exercise_logs): exercise_sets';
END $$;

-- ---------------------------------------------------------------------------
-- 4) Verify: every table below should show rls_enabled = true with policies > 0
-- ---------------------------------------------------------------------------
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;
