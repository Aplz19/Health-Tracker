-- Per-day nutrition data-quality flag.
--
-- Some days simply cannot be tracked accurately (travelling, no scale, a meal
-- out with no nutrition info). Logging a partial day is worse than logging
-- nothing: a day with breakfast and lunch but no dinner looks like a genuine
-- low-calorie day and silently drags every average and correlation with it.
--
-- This records the FACT that a day's nutrition is untrustworthy. It does not
-- decide policy: analyses exclude flagged days by default but can opt in.
--
-- Lives on daily_notes because that table is already one row per user per date
-- (UNIQUE (user_id, date)) and is already read by the daily-summary aggregation.
-- `note` defaults to '', so the flag can be upserted without touching the note,
-- and the habits-tab note editor writes only `note`/`updated_at`, so the two
-- never clobber each other.
--
-- NULL = fully tracked (the default). Stored as text rather than a boolean so
-- 'estimated' can join 'incomplete' later without a migration and without
-- retroactively losing the distinction.
--
-- SAFETY: additive only. Adds a nullable column; touches no existing data.
-- Existing daily_summaries rows simply lack the key and are treated as tracked.
--
-- ROLLBACK:
--   ALTER TABLE public.daily_notes DROP COLUMN nutrition_quality;

ALTER TABLE public.daily_notes
  ADD COLUMN IF NOT EXISTS nutrition_quality TEXT;

ALTER TABLE public.daily_notes
  DROP CONSTRAINT IF EXISTS daily_notes_nutrition_quality_check;

ALTER TABLE public.daily_notes
  ADD CONSTRAINT daily_notes_nutrition_quality_check
  CHECK (nutrition_quality IS NULL OR nutrition_quality IN ('incomplete', 'estimated'));

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'daily_notes'
ORDER BY ordinal_position;
