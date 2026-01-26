-- Enable RLS and policies for daily_summaries
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;

-- Allow users to read their own summaries
CREATE POLICY "daily_summaries_select_own"
ON daily_summaries
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own summaries
CREATE POLICY "daily_summaries_insert_own"
ON daily_summaries
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own summaries
CREATE POLICY "daily_summaries_update_own"
ON daily_summaries
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
