-- Restaurant food catalog + provenance contract.
--
-- STAGED ONLY: do not run until the offline approved-pipeline transfer bundle
-- has been reviewed. Existing manual/OFF/USDA rows remain valid and active.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE foods
  ALTER COLUMN source TYPE text USING source::text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS brand_slug text,
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_category text,
  ADD COLUMN IF NOT EXISTS variant_label text,
  ADD COLUMN IF NOT EXISTS cholesterol numeric,
  ADD COLUMN IF NOT EXISTS source_external_id text,
  ADD COLUMN IF NOT EXISTS source_identity_key text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS supersedes_food_id uuid REFERENCES foods(id);

-- Replace a legacy source CHECK without assuming its generated constraint name.
DO $$
DECLARE
  source_constraint record;
BEGIN
  FOR source_constraint IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attname = 'source'
     AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'foods'::regclass
      AND c.contype = 'c'
  LOOP
    EXECUTE format(
      'ALTER TABLE foods DROP CONSTRAINT %I',
      source_constraint.conname
    );
  END LOOP;
END $$;

ALTER TABLE foods
  ADD CONSTRAINT foods_source_check
  CHECK (source IN ('manual', 'usda', 'openfoodfacts', 'restaurant_official'));

CREATE INDEX IF NOT EXISTS foods_name_trgm_idx
  ON foods USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS foods_brand_trgm_idx
  ON foods USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS foods_brand_slug_idx
  ON foods (brand_slug)
  WHERE brand_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS foods_active_source_idx
  ON foods (source, is_active);

-- One immutable nutrient version per logical restaurant item/content hash.
CREATE UNIQUE INDEX IF NOT EXISTS foods_restaurant_version_unique
  ON foods (source_identity_key, content_hash)
  WHERE source = 'restaurant_official';

-- Only one version is returned by normal search. A refresh inserts a new row,
-- deactivates the old row, and links it with supersedes_food_id; it never changes
-- nutrition underneath historical food_logs.
CREATE UNIQUE INDEX IF NOT EXISTS foods_restaurant_one_active_version
  ON foods (source_identity_key)
  WHERE source = 'restaurant_official' AND is_active;

CREATE TABLE IF NOT EXISTS food_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key text NOT NULL UNIQUE,
  chain text NOT NULL,
  pipeline_job_slug text NOT NULL,
  candidate_sha256 text NOT NULL,
  audit_sha256 text NOT NULL,
  audit_model text NOT NULL,
  audit_verdict text NOT NULL CHECK (audit_verdict = 'PASS'),
  expected_rows integer NOT NULL CHECK (expected_rows > 0),
  checked_rows integer NOT NULL CHECK (checked_rows = expected_rows),
  approved_at timestamptz NOT NULL,
  audit_usage jsonb NOT NULL DEFAULT '{}',
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS food_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id uuid NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
  import_batch_id uuid NOT NULL REFERENCES food_import_batches(id) ON DELETE RESTRICT,
  pipeline_row_id text NOT NULL,
  pipeline_display_name text NOT NULL,
  source_url text NOT NULL,
  authorization_url text,
  source_id text NOT NULL,
  source_sha256 text,
  page_number integer,
  source_section text,
  source_category text,
  value_method text NOT NULL,
  evidence jsonb NOT NULL,
  raw_nutrients jsonb NOT NULL,
  nutrient_qualifiers jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_batch_id, pipeline_row_id)
);

ALTER TABLE food_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_provenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read food import batches"
  ON food_import_batches;
CREATE POLICY "Authenticated users can read food import batches"
  ON food_import_batches FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read food provenance"
  ON food_provenance;
CREATE POLICY "Authenticated users can read food provenance"
  ON food_provenance FOR SELECT
  TO authenticated
  USING (true);

-- Token-aware search: "tacobell crunchwrap" matches the Taco Bell alias and
-- Crunchwrap item name even though the complete phrase is not contiguous.
CREATE OR REPLACE FUNCTION search_global_foods(
  search_query text,
  result_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  name text,
  brand text,
  brand_slug text,
  search_aliases text[],
  source_category text,
  variant_label text,
  serving_size text,
  serving_size_grams double precision,
  calories double precision,
  protein double precision,
  total_fat double precision,
  saturated_fat double precision,
  trans_fat double precision,
  polyunsaturated_fat double precision,
  monounsaturated_fat double precision,
  cholesterol double precision,
  sodium double precision,
  total_carbohydrates double precision,
  fiber double precision,
  sugar double precision,
  added_sugar double precision,
  vitamin_a double precision,
  vitamin_c double precision,
  vitamin_d double precision,
  calcium double precision,
  iron double precision,
  fdc_id bigint,
  barcode text,
  source text,
  source_external_id text,
  source_identity_key text,
  content_hash text,
  is_active boolean,
  verified_at timestamptz,
  supersedes_food_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  search_rank double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT trim(
      regexp_replace(lower(coalesce(search_query, '')), '[^a-z0-9]+', ' ', 'g')
    ) AS query
  ), candidates AS (
    SELECT
      f.*,
      lower(concat_ws(
        ' ',
        f.name,
        f.brand,
        f.brand_slug,
        array_to_string(f.search_aliases, ' '),
        f.variant_label,
        f.source_category
      )) AS document,
      normalized.query
    FROM foods f
    CROSS JOIN normalized
    WHERE coalesce(f.is_active, true)
      AND normalized.query <> ''
  )
  SELECT
    c.id,
    c.name,
    c.brand,
    c.brand_slug,
    c.search_aliases,
    c.source_category,
    c.variant_label,
    c.serving_size,
    c.serving_size_grams::double precision,
    c.calories::double precision,
    c.protein::double precision,
    c.total_fat::double precision,
    c.saturated_fat::double precision,
    c.trans_fat::double precision,
    c.polyunsaturated_fat::double precision,
    c.monounsaturated_fat::double precision,
    c.cholesterol::double precision,
    c.sodium::double precision,
    c.total_carbohydrates::double precision,
    c.fiber::double precision,
    c.sugar::double precision,
    c.added_sugar::double precision,
    c.vitamin_a::double precision,
    c.vitamin_c::double precision,
    c.vitamin_d::double precision,
    c.calcium::double precision,
    c.iron::double precision,
    c.fdc_id::bigint,
    c.barcode,
    c.source,
    c.source_external_id,
    c.source_identity_key,
    c.content_hash,
    c.is_active,
    c.verified_at,
    c.supersedes_food_id,
    c.created_at,
    c.updated_at,
    greatest(
      similarity(lower(c.name), c.query),
      similarity(lower(coalesce(c.brand, '')), c.query),
      similarity(c.document, c.query)
    ) AS search_rank
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1
    FROM unnest(regexp_split_to_array(c.query, '\s+')) token
    WHERE c.document NOT LIKE '%' || token || '%'
  )
  ORDER BY
    CASE WHEN lower(c.name) = c.query THEN 0 ELSE 1 END,
    CASE WHEN lower(coalesce(c.brand, '')) = c.query THEN 0 ELSE 1 END,
    search_rank DESC,
    c.brand NULLS LAST,
    c.name
  LIMIT least(greatest(result_limit, 1), 100);
$$;

GRANT EXECUTE ON FUNCTION search_global_foods(text, integer) TO authenticated;

COMMENT ON COLUMN foods.brand IS
  'User-visible manufacturer or restaurant name; nullable for unbranded custom foods.';
COMMENT ON COLUMN foods.source_identity_key IS
  'Stable logical identity supplied by an authoritative importer; not a display label.';
COMMENT ON COLUMN foods.content_hash IS
  'Hash of the serving and nutrient content for immutable source versioning.';
COMMENT ON TABLE food_provenance IS
  'Source-owned evidence and raw published values for imported authoritative foods.';
