-- Supabase installs trusted extensions outside public. Keep every type,
-- operator, and opclass reference schema-qualified so search does not depend on
-- the session search_path.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'vector'
      AND namespace.nspname <> 'extensions'
  ) THEN
    RAISE EXCEPTION 'vector must be installed in the trusted extensions schema';
  END IF;
END;
$$;

-- Add embedding column to foods table
-- vector(1536) is the dimension size for OpenAI text-embedding-3-small
ALTER TABLE foods
ADD COLUMN IF NOT EXISTS embedding extensions.vector(1536),
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Create index for faster vector similarity search
-- Using ivfflat index (good for large datasets)
CREATE INDEX IF NOT EXISTS foods_embedding_idx
ON foods
USING ivfflat (embedding extensions.vector_cosine_ops)
WITH (lists = 100);

-- Function to search foods by semantic similarity
CREATE OR REPLACE FUNCTION search_foods_semantic(
  query_embedding extensions.vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  name text,
  serving_size text,
  serving_size_grams float,
  calories float,
  protein float,
  total_fat float,
  total_carbohydrates float,
  similarity float
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    foods.id::text,
    foods.name,
    foods.serving_size,
    foods.serving_size_grams::float,
    foods.calories::float,
    foods.protein::float,
    foods.total_fat::float,
    foods.total_carbohydrates::float,
    1 - (foods.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity
  FROM foods
  WHERE foods.embedding IS NOT NULL
    AND foods.is_active IS TRUE
    AND 1 - (foods.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY foods.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
END;
$$;

-- Function to search foods for a specific user (prioritizes their library)
CREATE OR REPLACE FUNCTION search_foods_semantic_user(
  query_embedding extensions.vector(1536),
  user_id_param text,
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  name text,
  serving_size text,
  serving_size_grams float,
  calories float,
  protein float,
  total_fat float,
  total_carbohydrates float,
  similarity float,
  in_library boolean
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    foods.id::text,
    foods.name,
    foods.serving_size,
    foods.serving_size_grams::float,
    foods.calories::float,
    foods.protein::float,
    foods.total_fat::float,
    foods.total_carbohydrates::float,
    1 - (foods.embedding OPERATOR(extensions.<=>) query_embedding) AS similarity,
    EXISTS(
      SELECT 1 FROM user_food_library
      WHERE user_food_library.food_id = foods.id
        AND user_food_library.user_id = auth.uid()
    ) AS in_library
  FROM foods
  WHERE foods.embedding IS NOT NULL
    AND foods.is_active IS TRUE
    AND 1 - (foods.embedding OPERATOR(extensions.<=>) query_embedding) > match_threshold
  ORDER BY
    -- Prioritize foods in user's library
    EXISTS(
      SELECT 1 FROM user_food_library
      WHERE user_food_library.food_id = foods.id
        AND user_food_library.user_id = auth.uid()
    ) DESC,
    -- Then by similarity
    foods.embedding OPERATOR(extensions.<=>) query_embedding
  LIMIT match_count;
END;
$$;

REVOKE ALL ON FUNCTION public.search_foods_semantic(extensions.vector, double precision, integer)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_foods_semantic_user(extensions.vector, text, double precision, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_foods_semantic(extensions.vector, double precision, integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_foods_semantic_user(extensions.vector, text, double precision, integer)
  TO authenticated;

-- Comments for documentation
COMMENT ON COLUMN foods.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions) for semantic search';
COMMENT ON FUNCTION search_foods_semantic IS 'Search foods by semantic similarity using vector embeddings';
COMMENT ON FUNCTION search_foods_semantic_user IS 'Search foods by semantic similarity, prioritizing user library foods';
