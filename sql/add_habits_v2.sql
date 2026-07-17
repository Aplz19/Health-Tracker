-- Habits v2: user-defined habits with typed values + daily notes
--
-- What this adds:
--   1. user_habits        - per-user habit DEFINITIONS (replaces the hardcoded
--                           HABIT_DEFINITIONS list + user_habit_preferences as
--                           the source of truth). Users can create custom
--                           habits with an emoji, a unit, and a value kind.
--   2. habit_logs changes - value_kind snapshot column (each log remembers the
--                           kind it was recorded under, so changing a habit's
--                           kind never rewrites history) + value_text (holds
--                           the selected option for choice-kind habits).
--   3. daily_notes        - one free-text journal note per user per day.
--
-- Value kinds:
--   checkbox - did / didn't            (log: completed)
--   number   - an amount (min, XP, drinks); optional goal enables the
--              one-tap quick-complete checkbox in the UI (log: amount)
--   scale    - subjective 1-5 rating   (log: amount; ABSENT ROW = not
--              reported (NA), never auto-created, never defaulted)
--   choice   - one of a set of named options, e.g. day type
--              green/red/life          (log: value_text)
--
-- Data-honesty rules encoded here (mirror of the app's provenance rules):
--   * Sparse truth: unlogged scale/choice values are MISSING, not zero/false.
--     The app never auto-creates rows for scale/choice habits.
--   * Logs snapshot their value_kind at write time. Changing a habit's kind
--     applies to future logs only; old rows stay interpretable as recorded.
--   * Habits are archived (archived_at), never deleted, so logs never orphan.
--
-- The app runs correctly with this migration UNAPPLIED (it falls back to the
-- legacy hardcoded-definitions + user_habit_preferences path and disables
-- custom habits / scale / choice / notes). Apply in the Supabase SQL editor.
-- Safe to re-run: everything is IF NOT EXISTS / ON CONFLICT DO NOTHING.

-- ---------------------------------------------------------------------------
-- 1. user_habits: per-user habit definitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS user_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Stable identity that habit_logs.habit_key points at. Seeded built-ins
  -- reuse their legacy keys (meditation, math_academy, ...) so existing logs
  -- stay attached. Custom habits get generated keys (custom_<uuid-ish>).
  habit_key TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Custom habits show an emoji; seeded built-ins keep their app icon (emoji
  -- stays NULL and the client maps habit_key -> lucide icon).
  emoji TEXT,
  unit TEXT NOT NULL DEFAULT '',
  value_kind TEXT NOT NULL DEFAULT 'checkbox'
    CHECK (value_kind IN ('checkbox', 'number', 'scale', 'choice')),
  -- number kind: optional goal (enables quick-complete) + stepper increment
  goal_amount NUMERIC,
  step NUMERIC,
  -- choice kind: JSON array of option strings, e.g. ["green","red","life"]
  choice_options JSONB,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Archived habits disappear from every list but keep their logs forever.
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, habit_key),
  -- choice habits must have options; non-choice habits must not
  CONSTRAINT choice_options_shape CHECK (
    (value_kind = 'choice' AND jsonb_typeof(choice_options) = 'array')
    OR (value_kind <> 'choice' AND choice_options IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_user_habits_user_id
  ON user_habits(user_id);

ALTER TABLE user_habits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own habits" ON user_habits;
CREATE POLICY "Users can view their own habits"
  ON user_habits FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own habits" ON user_habits;
CREATE POLICY "Users can insert their own habits"
  ON user_habits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own habits" ON user_habits;
CREATE POLICY "Users can update their own habits"
  ON user_habits FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own habits" ON user_habits;
CREATE POLICY "Users can delete their own habits"
  ON user_habits FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. habit_logs: value_kind snapshot + choice value
-- ---------------------------------------------------------------------------

ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS value_kind TEXT
  CHECK (value_kind IS NULL OR value_kind IN ('checkbox', 'number', 'scale', 'choice'));
ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS value_text TEXT;

COMMENT ON COLUMN habit_logs.value_kind IS
  'Kind the log was recorded under (snapshot). NULL = legacy row from before habits v2; interpret via completed/amount.';
COMMENT ON COLUMN habit_logs.value_text IS
  'Selected option for choice-kind logs (e.g. green/red/life). NULL for other kinds.';

-- ---------------------------------------------------------------------------
-- 3. daily_notes: one journal note per user per day
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS daily_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_notes_user_date
  ON daily_notes(user_id, date);

ALTER TABLE daily_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own daily notes" ON daily_notes;
CREATE POLICY "Users can view their own daily notes"
  ON daily_notes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own daily notes" ON daily_notes;
CREATE POLICY "Users can insert their own daily notes"
  ON daily_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own daily notes" ON daily_notes;
CREATE POLICY "Users can update their own daily notes"
  ON daily_notes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own daily notes" ON daily_notes;
CREATE POLICY "Users can delete their own daily notes"
  ON daily_notes FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Seed user_habits from the legacy built-ins each user had configured
-- ---------------------------------------------------------------------------
-- Maps legacy tracking_mode -> value_kind:
--   checkbox        -> checkbox (goal cleared: checkboxes have no amount)
--   goal / manual   -> number   (keeps the user's goal_amount; goal mode's
--                                quick-complete checkbox returns automatically
--                                because number-with-goal renders it)
-- Only seeds habits the user has a preference row for (i.e. ever touched).
-- Never overwrites: ON CONFLICT DO NOTHING, so re-running is safe and user
-- edits made after migration are preserved.

INSERT INTO user_habits
  (user_id, habit_key, name, emoji, unit, value_kind, goal_amount, step, is_enabled, sort_order)
SELECT
  p.user_id,
  p.habit_key,
  d.name,
  NULL,
  d.unit,
  CASE WHEN p.tracking_mode = 'checkbox' THEN 'checkbox' ELSE 'number' END,
  CASE WHEN p.tracking_mode = 'checkbox' THEN NULL
       ELSE COALESCE(p.goal_amount, d.default_goal) END,
  d.step,
  p.is_enabled,
  p.sort_order
FROM user_habit_preferences p
JOIN (
  VALUES
    ('meditation',   'Meditation',   'min',    15::numeric,  5::numeric),
    ('reading',      'Reading',      'min',    30,           5),
    ('sauna',        'Sauna',        'min',    20,           5),
    ('thc',          'THC',          'uses',   1,            1),
    ('alcohol',      'Alcohol',      'drinks', 2,            1),
    ('cold_shower',  'Cold Shower',  'min',    3,            1),
    ('nicotine',     'Nicotine',     'uses',   1,            1),
    ('energy_drink', 'Energy Drink', 'drinks', 1,            1),
    ('coffee',       'Coffee',       'cups',   2,            1),
    ('ate_out',      'Ate Out',      'meals',  1,            1),
    ('math_academy', 'Math Academy', 'XP',     100,          10),
    ('anki_review',  'Anki Review',  'cards',  50,           10)
) AS d(habit_key, name, unit, default_goal, step)
  ON d.habit_key = p.habit_key
ON CONFLICT (user_id, habit_key) DO NOTHING;
