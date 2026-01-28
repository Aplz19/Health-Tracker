-- Create workout_sessions table
-- Groups exercises together with optional Whoop workout linking

CREATE TABLE IF NOT EXISTS workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  notes TEXT,

  -- Whoop data (filled when linked)
  whoop_workout_id TEXT UNIQUE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  strain NUMERIC(4,1),
  avg_hr INTEGER,
  max_hr INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_date
  ON workout_sessions(user_id, date);

-- Enable RLS
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own workout sessions"
  ON workout_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own workout sessions"
  ON workout_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own workout sessions"
  ON workout_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own workout sessions"
  ON workout_sessions FOR DELETE
  USING (auth.uid() = user_id);


-- Create whoop_workouts table
-- Cache for Whoop workouts to enable linking UI

CREATE TABLE IF NOT EXISTS whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  sport_id INTEGER,
  strain NUMERIC(4,1),
  avg_hr INTEGER,
  max_hr INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, whoop_workout_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user_id
  ON whoop_workouts(user_id);

-- Enable RLS
ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own whoop workouts"
  ON whoop_workouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own whoop workouts"
  ON whoop_workouts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own whoop workouts"
  ON whoop_workouts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own whoop workouts"
  ON whoop_workouts FOR DELETE
  USING (auth.uid() = user_id);


-- Add session_id column to exercise_logs
ALTER TABLE exercise_logs
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES workout_sessions(id) ON DELETE SET NULL;

-- Create index for session lookups
CREATE INDEX IF NOT EXISTS idx_exercise_logs_session_id
  ON exercise_logs(session_id);
