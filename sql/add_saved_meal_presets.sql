-- Create saved_meal_presets table
-- Stores user's saved meal combinations (like MyFitnessPal)

CREATE TABLE IF NOT EXISTS saved_meal_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_saved_meal_presets_user_id
  ON saved_meal_presets(user_id);

-- Enable RLS
ALTER TABLE saved_meal_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own saved meal presets"
  ON saved_meal_presets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved meal presets"
  ON saved_meal_presets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved meal presets"
  ON saved_meal_presets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved meal presets"
  ON saved_meal_presets FOR DELETE
  USING (auth.uid() = user_id);


-- Create saved_meal_preset_items table
-- Foods within a saved meal preset

CREATE TABLE IF NOT EXISTS saved_meal_preset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id UUID NOT NULL REFERENCES saved_meal_presets(id) ON DELETE CASCADE,
  food_id UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  servings NUMERIC NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(preset_id, food_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_saved_meal_preset_items_preset_id
  ON saved_meal_preset_items(preset_id);

-- Enable RLS
ALTER TABLE saved_meal_preset_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies (access through preset ownership)
CREATE POLICY "Users can view items of their own presets"
  ON saved_meal_preset_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM saved_meal_presets
      WHERE saved_meal_presets.id = saved_meal_preset_items.preset_id
      AND saved_meal_presets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert items to their own presets"
  ON saved_meal_preset_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM saved_meal_presets
      WHERE saved_meal_presets.id = saved_meal_preset_items.preset_id
      AND saved_meal_presets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update items in their own presets"
  ON saved_meal_preset_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM saved_meal_presets
      WHERE saved_meal_presets.id = saved_meal_preset_items.preset_id
      AND saved_meal_presets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete items from their own presets"
  ON saved_meal_preset_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM saved_meal_presets
      WHERE saved_meal_presets.id = saved_meal_preset_items.preset_id
      AND saved_meal_presets.user_id = auth.uid()
    )
  );
