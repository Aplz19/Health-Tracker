-- Create habit_logs table
-- Stores daily habit completion records

CREATE TABLE IF NOT EXISTS habit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  habit_key TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each user can only have one log per habit per day
  UNIQUE(user_id, date, habit_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_habit_logs_user_date
  ON habit_logs(user_id, date);

-- Enable RLS
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own habit logs"
  ON habit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit logs"
  ON habit_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit logs"
  ON habit_logs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit logs"
  ON habit_logs FOR DELETE
  USING (auth.uid() = user_id);


-- Create user_habit_preferences table
-- Stores which habits are enabled and their settings

CREATE TABLE IF NOT EXISTS user_habit_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  tracking_mode TEXT NOT NULL DEFAULT 'checkbox' CHECK (tracking_mode IN ('checkbox', 'goal', 'manual')),
  goal_amount NUMERIC,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each user can only have one preference per habit
  UNIQUE(user_id, habit_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_habit_preferences_user_id
  ON user_habit_preferences(user_id);

-- Enable RLS
ALTER TABLE user_habit_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own habit preferences"
  ON user_habit_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own habit preferences"
  ON user_habit_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own habit preferences"
  ON user_habit_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own habit preferences"
  ON user_habit_preferences FOR DELETE
  USING (auth.uid() = user_id);
