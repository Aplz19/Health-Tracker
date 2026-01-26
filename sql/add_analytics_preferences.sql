-- Create user_analytics_preferences table
-- Stores user preferences for which metrics to display on the analytics dashboard

CREATE TABLE IF NOT EXISTS user_analytics_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each user can only have one preference per metric
  UNIQUE(user_id, metric_key)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_analytics_preferences_user_id
  ON user_analytics_preferences(user_id);

-- Enable RLS
ALTER TABLE user_analytics_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own preferences
CREATE POLICY "Users can view their own analytics preferences"
  ON user_analytics_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analytics preferences"
  ON user_analytics_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analytics preferences"
  ON user_analytics_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analytics preferences"
  ON user_analytics_preferences FOR DELETE
  USING (auth.uid() = user_id);
