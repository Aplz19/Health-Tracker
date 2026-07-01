-- Create user_nutrition_goals table
-- Stores each user's daily calorie + macro goals so they sync across every
-- device. Previously these lived only in localStorage, which is per-browser,
-- so iOS and laptop kept separate copies that never matched.

CREATE TABLE IF NOT EXISTS user_nutrition_goals (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calories INTEGER NOT NULL DEFAULT 2000,
  protein_percent INTEGER NOT NULL DEFAULT 30,
  carbs_percent INTEGER NOT NULL DEFAULT 40,
  fat_percent INTEGER NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE user_nutrition_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (each user can only see/modify their own goals row)
CREATE POLICY "Users can view their own nutrition goals"
  ON user_nutrition_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own nutrition goals"
  ON user_nutrition_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own nutrition goals"
  ON user_nutrition_goals FOR UPDATE
  USING (auth.uid() = user_id);
