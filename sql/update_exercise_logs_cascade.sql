-- Migration: Update exercise_logs foreign key to CASCADE delete
-- When a workout_session is deleted, all its exercise_logs (and their sets) should be deleted automatically

-- Drop existing foreign key constraint
ALTER TABLE exercise_logs
DROP CONSTRAINT IF EXISTS exercise_logs_session_id_fkey;

-- Add new foreign key constraint with CASCADE delete
ALTER TABLE exercise_logs
ADD CONSTRAINT exercise_logs_session_id_fkey
FOREIGN KEY (session_id)
REFERENCES workout_sessions(id)
ON DELETE CASCADE;

-- Verify the constraint is set up correctly
-- (You can uncomment this to check in psql)
-- SELECT
--   conname,
--   conrelid::regclass AS table_name,
--   confrelid::regclass AS foreign_table,
--   pg_get_constraintdef(oid) AS constraint_def
-- FROM pg_constraint
-- WHERE conname = 'exercise_logs_session_id_fkey';
