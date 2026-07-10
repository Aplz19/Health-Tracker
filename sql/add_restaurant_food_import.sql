-- Restaurant food catalog + provenance contract.
--
-- STAGED ONLY: do not run until the offline approved-pipeline transfer bundle
-- has been reviewed. Existing manual/OFF/USDA rows remain valid and active.

BEGIN;

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

-- The receiver sends one bounded JSON document after checking the bundle's
-- hashes and schema offline. This function independently rechecks the database
-- contract and performs batches -> immutable food versions -> provenance in one
-- transaction. Any exception rolls back every write. A transaction-scoped lock
-- serializes catalog refreshes so two service jobs cannot race the active-version
-- uniqueness rule.
CREATE OR REPLACE FUNCTION public.import_restaurant_food_bundle(bundle jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  contract_name constant text := 'health-tracker-restaurant-foods-v1';
  chain_count integer;
  food_count integer;
  provenance_count integer;
  inserted_batch_count integer := 0;
  inserted_food_count integer := 0;
  reactivated_food_count integer := 0;
  deactivated_food_count integer := 0;
  inserted_provenance_count integer := 0;
BEGIN
  IF bundle IS NULL OR jsonb_typeof(bundle) <> 'object' THEN
    RAISE EXCEPTION 'bundle must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF octet_length(bundle::text) > 67108864 THEN
    RAISE EXCEPTION 'bundle exceeds the 64 MiB database limit' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(bundle)) <> 5
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(bundle) supplied(key)
       WHERE supplied.key <> ALL (ARRAY['contract', 'counts', 'batches', 'foods', 'provenance'])
     )
  THEN
    RAISE EXCEPTION 'bundle fields differ from the v1 contract' USING ERRCODE = '22023';
  END IF;
  IF bundle ->> 'contract' IS DISTINCT FROM contract_name THEN
    RAISE EXCEPTION 'unsupported restaurant import contract' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(bundle -> 'counts') <> 'object'
     OR (SELECT count(*) FROM jsonb_object_keys(bundle -> 'counts')) <> 3
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(bundle -> 'counts') supplied(key)
       WHERE supplied.key <> ALL (ARRAY['chains', 'foods', 'provenance'])
     )
     OR jsonb_typeof(bundle -> 'batches') <> 'array'
     OR jsonb_typeof(bundle -> 'foods') <> 'array'
     OR jsonb_typeof(bundle -> 'provenance') <> 'array'
  THEN
    RAISE EXCEPTION 'bundle counts or row collections are malformed' USING ERRCODE = '22023';
  END IF;

  chain_count := (bundle #>> '{counts,chains}')::integer;
  food_count := (bundle #>> '{counts,foods}')::integer;
  provenance_count := (bundle #>> '{counts,provenance}')::integer;
  IF chain_count < 1 OR chain_count > 64
     OR food_count < 1 OR food_count > 20000
     OR provenance_count <> food_count
     OR jsonb_array_length(bundle -> 'batches') <> chain_count
     OR jsonb_array_length(bundle -> 'foods') <> food_count
     OR jsonb_array_length(bundle -> 'provenance') <> provenance_count
  THEN
    RAISE EXCEPTION 'bundle counts are out of bounds or do not match row collections'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'batches') row(value)
    WHERE jsonb_typeof(row.value) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'batches') row(value)
    WHERE (SELECT count(*) FROM jsonb_object_keys(row.value)) <> 11
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(row.value) supplied(key)
         WHERE supplied.key <> ALL (ARRAY[
           'approved_at', 'audit_model', 'audit_sha256', 'audit_usage',
           'audit_verdict', 'batch_key', 'candidate_sha256', 'chain',
           'checked_rows', 'expected_rows', 'pipeline_job_slug'
         ])
       )
  ) THEN
    RAISE EXCEPTION 'batch fields differ from the v1 contract' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'foods') row(value)
    WHERE jsonb_typeof(row.value) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'foods') row(value)
    WHERE (SELECT count(*) FROM jsonb_object_keys(row.value)) <> 35
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(row.value) supplied(key)
         WHERE supplied.key <> ALL (ARRAY[
           'added_sugar', 'barcode', 'brand', 'brand_slug', 'calcium',
           'calories', 'cholesterol', 'content_hash', 'embedding', 'fdc_id',
           'fiber', 'iron', 'is_active', 'monounsaturated_fat', 'name',
           'polyunsaturated_fat', 'protein', 'saturated_fat', 'search_aliases',
           'serving_size', 'serving_size_grams', 'sodium', 'source',
           'source_category', 'source_external_id', 'source_identity_key',
           'sugar', 'total_carbohydrates', 'total_fat', 'trans_fat',
           'variant_label', 'verified_at', 'vitamin_a', 'vitamin_c', 'vitamin_d'
         ])
       )
  ) THEN
    RAISE EXCEPTION 'food fields differ from the v1 contract' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'provenance') row(value)
    WHERE jsonb_typeof(row.value) <> 'object'
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(bundle -> 'provenance') row(value)
    WHERE (SELECT count(*) FROM jsonb_object_keys(row.value)) <> 16
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(row.value) supplied(key)
         WHERE supplied.key <> ALL (ARRAY[
           'authorization_url', 'batch_key', 'content_hash', 'evidence',
           'nutrient_qualifiers', 'page_number', 'pipeline_display_name',
           'pipeline_row_id', 'raw_nutrients', 'source_category', 'source_id',
           'source_identity_key', 'source_section', 'source_sha256',
           'source_url', 'value_method'
         ])
       )
  ) THEN
    RAISE EXCEPTION 'provenance fields differ from the v1 contract' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('restaurant-food-import-v1', 0));

  CREATE TEMP TABLE pg_temp.restaurant_batch_stage (
    batch_key text PRIMARY KEY,
    chain text NOT NULL,
    pipeline_job_slug text NOT NULL,
    candidate_sha256 text NOT NULL,
    audit_sha256 text NOT NULL,
    audit_model text NOT NULL,
    audit_verdict text NOT NULL,
    expected_rows integer NOT NULL,
    checked_rows integer NOT NULL,
    approved_at timestamptz NOT NULL,
    audit_usage jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.restaurant_batch_stage
  SELECT *
  FROM jsonb_to_recordset(bundle -> 'batches') AS batch(
    batch_key text,
    chain text,
    pipeline_job_slug text,
    candidate_sha256 text,
    audit_sha256 text,
    audit_model text,
    audit_verdict text,
    expected_rows integer,
    checked_rows integer,
    approved_at timestamptz,
    audit_usage jsonb
  );

  IF EXISTS (
    SELECT 1 FROM pg_temp.restaurant_batch_stage batch
    WHERE batch.batch_key !~ '^[0-9a-f]{64}$'
       OR batch.candidate_sha256 !~ '^[0-9a-f]{64}$'
       OR batch.audit_sha256 !~ '^[0-9a-f]{64}$'
       OR batch.audit_verdict <> 'PASS'
       OR batch.expected_rows < 1
       OR batch.checked_rows <> batch.expected_rows
       OR length(trim(batch.chain)) NOT BETWEEN 1 AND 120
       OR length(trim(batch.pipeline_job_slug)) NOT BETWEEN 1 AND 160
       OR length(trim(batch.audit_model)) NOT BETWEEN 1 AND 160
       OR jsonb_typeof(batch.audit_usage) <> 'object'
  ) THEN
    RAISE EXCEPTION 'batch audit, hash, count, or text validation failed' USING ERRCODE = '22023';
  END IF;
  IF (SELECT sum(expected_rows) FROM pg_temp.restaurant_batch_stage) <> food_count THEN
    RAISE EXCEPTION 'batch expected row totals differ from the manifest' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE pg_temp.restaurant_food_stage (
    name text NOT NULL,
    brand text NOT NULL,
    brand_slug text NOT NULL,
    search_aliases text[] NOT NULL,
    source_category text,
    variant_label text,
    serving_size text NOT NULL,
    serving_size_grams numeric,
    calories numeric NOT NULL,
    protein numeric NOT NULL,
    total_fat numeric NOT NULL,
    saturated_fat numeric NOT NULL,
    cholesterol numeric NOT NULL,
    sodium numeric NOT NULL,
    total_carbohydrates numeric NOT NULL,
    fiber numeric NOT NULL,
    sugar numeric NOT NULL,
    trans_fat numeric,
    polyunsaturated_fat numeric,
    monounsaturated_fat numeric,
    added_sugar numeric,
    vitamin_a numeric,
    vitamin_c numeric,
    vitamin_d numeric,
    calcium numeric,
    iron numeric,
    source_external_id text,
    source_identity_key text NOT NULL,
    content_hash text NOT NULL,
    verified_at timestamptz NOT NULL,
    PRIMARY KEY (source_identity_key, content_hash),
    UNIQUE (source_identity_key)
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.restaurant_food_stage
  SELECT
    food.name,
    food.brand,
    food.brand_slug,
    food.search_aliases,
    food.source_category,
    food.variant_label,
    food.serving_size,
    food.serving_size_grams,
    food.calories,
    food.protein,
    food.total_fat,
    food.saturated_fat,
    food.cholesterol,
    food.sodium,
    food.total_carbohydrates,
    food.fiber,
    food.sugar,
    food.trans_fat,
    food.polyunsaturated_fat,
    food.monounsaturated_fat,
    food.added_sugar,
    food.vitamin_a,
    food.vitamin_c,
    food.vitamin_d,
    food.calcium,
    food.iron,
    food.source_external_id,
    food.source_identity_key,
    food.content_hash,
    food.verified_at
  FROM jsonb_to_recordset(bundle -> 'foods') AS food(
    name text,
    brand text,
    brand_slug text,
    search_aliases text[],
    source_category text,
    variant_label text,
    serving_size text,
    serving_size_grams numeric,
    calories numeric,
    protein numeric,
    total_fat numeric,
    saturated_fat numeric,
    cholesterol numeric,
    sodium numeric,
    total_carbohydrates numeric,
    fiber numeric,
    sugar numeric,
    trans_fat numeric,
    polyunsaturated_fat numeric,
    monounsaturated_fat numeric,
    added_sugar numeric,
    vitamin_a numeric,
    vitamin_c numeric,
    vitamin_d numeric,
    calcium numeric,
    iron numeric,
    source_external_id text,
    source_identity_key text,
    content_hash text,
    verified_at timestamptz
  );

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(bundle -> 'foods') row(value)
    WHERE row.value ->> 'source' IS DISTINCT FROM 'restaurant_official'
       OR row.value -> 'is_active' IS DISTINCT FROM 'true'::jsonb
       OR row.value -> 'fdc_id' IS DISTINCT FROM 'null'::jsonb
       OR row.value -> 'barcode' IS DISTINCT FROM 'null'::jsonb
       OR row.value -> 'embedding' IS DISTINCT FROM 'null'::jsonb
  ) OR EXISTS (
    SELECT 1 FROM pg_temp.restaurant_food_stage food
    WHERE length(trim(food.name)) NOT BETWEEN 1 AND 300
       OR length(trim(food.brand)) NOT BETWEEN 1 AND 120
       OR length(trim(food.brand_slug)) NOT BETWEEN 1 AND 120
       OR food.brand_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       OR food.source_identity_key !~ ('^restaurant:' || food.brand_slug || ':[0-9a-f]{64}$')
       OR food.content_hash !~ '^[0-9a-f]{64}$'
       OR length(trim(food.serving_size)) NOT BETWEEN 1 AND 160
       OR cardinality(food.search_aliases) NOT BETWEEN 1 AND 16
       OR EXISTS (SELECT 1 FROM unnest(food.search_aliases) alias WHERE length(trim(alias)) NOT BETWEEN 1 AND 120)
       OR length(coalesce(food.source_category, '')) > 200
       OR length(coalesce(food.variant_label, '')) > 120
       OR length(coalesce(food.source_external_id, '')) > 300
       OR EXISTS (
         SELECT 1 FROM unnest(ARRAY[
           food.serving_size_grams, food.calories, food.protein, food.total_fat,
           food.saturated_fat, food.cholesterol, food.sodium,
           food.total_carbohydrates, food.fiber, food.sugar, food.trans_fat,
           food.polyunsaturated_fat, food.monounsaturated_fat, food.added_sugar,
           food.vitamin_a, food.vitamin_c, food.vitamin_d, food.calcium, food.iron
         ]) nutrient(value)
         WHERE nutrient.value < 0 OR nutrient.value > 10000000
       )
  ) THEN
    RAISE EXCEPTION 'food source, identity, text, or nutrient validation failed' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE pg_temp.restaurant_provenance_stage (
    batch_key text NOT NULL,
    source_identity_key text NOT NULL,
    content_hash text NOT NULL,
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
    nutrient_qualifiers jsonb NOT NULL,
    PRIMARY KEY (batch_key, pipeline_row_id),
    UNIQUE (source_identity_key, content_hash)
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.restaurant_provenance_stage
  SELECT *
  FROM jsonb_to_recordset(bundle -> 'provenance') AS provenance(
    batch_key text,
    source_identity_key text,
    content_hash text,
    pipeline_row_id text,
    pipeline_display_name text,
    source_url text,
    authorization_url text,
    source_id text,
    source_sha256 text,
    page_number integer,
    source_section text,
    source_category text,
    value_method text,
    evidence jsonb,
    raw_nutrients jsonb,
    nutrient_qualifiers jsonb
  );

  IF EXISTS (
    SELECT 1 FROM pg_temp.restaurant_provenance_stage provenance
    WHERE provenance.batch_key !~ '^[0-9a-f]{64}$'
       OR provenance.content_hash !~ '^[0-9a-f]{64}$'
       OR length(trim(provenance.pipeline_row_id)) NOT BETWEEN 1 AND 200
       OR length(trim(provenance.pipeline_display_name)) NOT BETWEEN 1 AND 500
       OR length(trim(provenance.source_id)) NOT BETWEEN 1 AND 200
       OR length(trim(provenance.value_method)) NOT BETWEEN 1 AND 200
       OR provenance.source_url !~ '^https://'
       OR (provenance.authorization_url IS NOT NULL AND provenance.authorization_url !~ '^https://')
       OR (provenance.source_sha256 IS NOT NULL AND provenance.source_sha256 !~ '^[0-9a-f]{64}$')
       OR (provenance.page_number IS NOT NULL AND provenance.page_number < 1)
       OR length(coalesce(provenance.source_section, '')) > 200
       OR length(coalesce(provenance.source_category, '')) > 200
       OR jsonb_typeof(provenance.evidence) <> 'array'
       OR jsonb_array_length(provenance.evidence) NOT BETWEEN 1 AND 32
       OR jsonb_typeof(provenance.raw_nutrients) <> 'object'
       OR jsonb_typeof(provenance.nutrient_qualifiers) <> 'object'
       OR (SELECT count(*) FROM jsonb_object_keys(provenance.raw_nutrients)) <> 9
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(provenance.raw_nutrients) supplied(key)
         WHERE supplied.key <> ALL (ARRAY[
           'calories', 'protein_g', 'total_fat_g', 'saturated_fat_g',
           'cholesterol_mg', 'sodium_mg', 'carbohydrates_g', 'fiber_g', 'sugars_g'
         ])
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(provenance.raw_nutrients) raw(key, value)
         WHERE jsonb_typeof(raw.value) <> 'string'
            OR length(trim(raw.value #>> '{}')) NOT BETWEEN 1 AND 80
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(provenance.evidence) evidence(value)
         WHERE jsonb_typeof(evidence.value) <> 'object'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(provenance.nutrient_qualifiers) qualifier(key)
         WHERE qualifier.key <> ALL (ARRAY[
           'calories', 'protein', 'total_fat', 'saturated_fat', 'cholesterol',
           'sodium', 'total_carbohydrates', 'fiber', 'sugar'
         ])
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(provenance.nutrient_qualifiers) qualifier(key, value)
         WHERE jsonb_typeof(qualifier.value) <> 'object'
       )
  ) THEN
    RAISE EXCEPTION 'provenance source, evidence, or nutrient validation failed' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.restaurant_provenance_stage provenance
    LEFT JOIN pg_temp.restaurant_batch_stage batch USING (batch_key)
    LEFT JOIN pg_temp.restaurant_food_stage food USING (source_identity_key, content_hash)
    WHERE batch.batch_key IS NULL
       OR food.source_identity_key IS NULL
       OR food.brand IS DISTINCT FROM batch.chain
       OR food.brand_slug IS DISTINCT FROM trim(
         both '-' from regexp_replace(lower(batch.chain), '[^a-z0-9]+', '-', 'g')
       )
       OR food.verified_at IS DISTINCT FROM batch.approved_at
       OR food.source_category IS DISTINCT FROM provenance.source_category
  ) OR EXISTS (
    SELECT 1
    FROM pg_temp.restaurant_batch_stage batch
    LEFT JOIN pg_temp.restaurant_provenance_stage provenance USING (batch_key)
    GROUP BY batch.batch_key, batch.expected_rows
    HAVING count(provenance.pipeline_row_id) <> batch.expected_rows
  ) THEN
    RAISE EXCEPTION 'batch, food, and provenance joins or counts are inconsistent'
      USING ERRCODE = '22023';
  END IF;

  -- Existing immutable keys must mean the exact same audited batch/version.
  IF EXISTS (
    SELECT 1
    FROM public.food_import_batches existing
    JOIN pg_temp.restaurant_batch_stage incoming USING (batch_key)
    WHERE ROW(
      existing.chain, existing.pipeline_job_slug, existing.candidate_sha256,
      existing.audit_sha256, existing.audit_model, existing.audit_verdict,
      existing.expected_rows, existing.checked_rows, existing.approved_at,
      existing.audit_usage
    ) IS DISTINCT FROM ROW(
      incoming.chain, incoming.pipeline_job_slug, incoming.candidate_sha256,
      incoming.audit_sha256, incoming.audit_model, incoming.audit_verdict,
      incoming.expected_rows, incoming.checked_rows, incoming.approved_at,
      incoming.audit_usage
    )
  ) THEN
    RAISE EXCEPTION 'an existing batch_key has different audited content' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.foods existing
    JOIN pg_temp.restaurant_food_stage incoming USING (source_identity_key, content_hash)
    WHERE existing.source <> 'restaurant_official'
       OR ROW(
         existing.name, existing.brand, existing.brand_slug, existing.search_aliases,
         existing.source_category, existing.variant_label, existing.serving_size,
         existing.serving_size_grams, existing.calories, existing.protein,
         existing.total_fat, existing.saturated_fat, existing.cholesterol,
         existing.sodium, existing.total_carbohydrates, existing.fiber,
         existing.sugar, existing.trans_fat, existing.polyunsaturated_fat,
         existing.monounsaturated_fat, existing.added_sugar, existing.vitamin_a,
         existing.vitamin_c, existing.vitamin_d, existing.calcium, existing.iron,
         existing.source_external_id
       ) IS DISTINCT FROM ROW(
         incoming.name, incoming.brand, incoming.brand_slug, incoming.search_aliases,
         incoming.source_category, incoming.variant_label, incoming.serving_size,
         incoming.serving_size_grams, incoming.calories, incoming.protein,
         incoming.total_fat, incoming.saturated_fat, incoming.cholesterol,
         incoming.sodium, incoming.total_carbohydrates, incoming.fiber,
         incoming.sugar, incoming.trans_fat, incoming.polyunsaturated_fat,
         incoming.monounsaturated_fat, incoming.added_sugar, incoming.vitamin_a,
         incoming.vitamin_c, incoming.vitamin_d, incoming.calcium, incoming.iron,
         incoming.source_external_id
       )
  ) THEN
    RAISE EXCEPTION 'an existing identity/content version has different food values'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.food_import_batches (
    batch_key, chain, pipeline_job_slug, candidate_sha256, audit_sha256,
    audit_model, audit_verdict, expected_rows, checked_rows, approved_at, audit_usage
  )
  SELECT
    batch_key, chain, pipeline_job_slug, candidate_sha256, audit_sha256,
    audit_model, audit_verdict, expected_rows, checked_rows, approved_at, audit_usage
  FROM pg_temp.restaurant_batch_stage
  ON CONFLICT (batch_key) DO NOTHING;
  GET DIAGNOSTICS inserted_batch_count = ROW_COUNT;

  CREATE TEMP TABLE pg_temp.restaurant_food_target ON COMMIT DROP AS
  SELECT
    incoming.*,
    existing.id AS target_food_id,
    coalesce(existing.is_active, false) AS target_was_active,
    active.id AS prior_active_food_id,
    NOT EXISTS (
      SELECT 1
      FROM public.food_provenance saved_provenance
      JOIN public.food_import_batches saved_batch
        ON saved_batch.id = saved_provenance.import_batch_id
      JOIN pg_temp.restaurant_provenance_stage requested
        ON requested.batch_key = saved_batch.batch_key
       AND requested.pipeline_row_id = saved_provenance.pipeline_row_id
      WHERE requested.source_identity_key = incoming.source_identity_key
        AND requested.content_hash = incoming.content_hash
    ) AS is_new_observation
  FROM pg_temp.restaurant_food_stage incoming
  LEFT JOIN public.foods existing
    ON existing.source = 'restaurant_official'
   AND existing.source_identity_key = incoming.source_identity_key
   AND existing.content_hash = incoming.content_hash
  LEFT JOIN public.foods active
    ON active.source = 'restaurant_official'
   AND active.source_identity_key = incoming.source_identity_key
   AND active.is_active IS TRUE;

  UPDATE public.foods current_version
  SET is_active = false, updated_at = now()
  FROM pg_temp.restaurant_food_target target
  WHERE target.is_new_observation
    AND current_version.id = target.prior_active_food_id
    AND current_version.id IS DISTINCT FROM target.target_food_id;
  GET DIAGNOSTICS deactivated_food_count = ROW_COUNT;

  INSERT INTO public.foods (
    name, brand, brand_slug, search_aliases, source_category, variant_label,
    serving_size, serving_size_grams, calories, protein, total_fat,
    saturated_fat, cholesterol, sodium, total_carbohydrates, fiber, sugar,
    trans_fat, polyunsaturated_fat, monounsaturated_fat, added_sugar,
    vitamin_a, vitamin_c, vitamin_d, calcium, iron, source,
    source_external_id, source_identity_key, content_hash, is_active,
    verified_at, supersedes_food_id
  )
  SELECT
    target.name, target.brand, target.brand_slug, target.search_aliases,
    target.source_category, target.variant_label, target.serving_size,
    target.serving_size_grams, target.calories, target.protein, target.total_fat,
    target.saturated_fat, target.cholesterol, target.sodium,
    target.total_carbohydrates, target.fiber, target.sugar, target.trans_fat,
    target.polyunsaturated_fat, target.monounsaturated_fat, target.added_sugar,
    target.vitamin_a, target.vitamin_c, target.vitamin_d, target.calcium,
    target.iron, 'restaurant_official', target.source_external_id,
    target.source_identity_key, target.content_hash, true, target.verified_at,
    target.prior_active_food_id
  FROM pg_temp.restaurant_food_target target
  WHERE target.target_food_id IS NULL;
  GET DIAGNOSTICS inserted_food_count = ROW_COUNT;

  UPDATE public.foods existing
  SET
    is_active = true,
    verified_at = target.verified_at,
    supersedes_food_id = target.prior_active_food_id,
    updated_at = now()
  FROM pg_temp.restaurant_food_target target
  WHERE target.is_new_observation
    AND target.target_food_id = existing.id
    AND NOT target.target_was_active;
  GET DIAGNOSTICS reactivated_food_count = ROW_COUNT;

  -- A conflicting existing provenance row is never silently overwritten.
  IF EXISTS (
    SELECT 1
    FROM pg_temp.restaurant_provenance_stage incoming
    JOIN public.food_import_batches batch USING (batch_key)
    JOIN public.food_provenance existing
      ON existing.import_batch_id = batch.id
     AND existing.pipeline_row_id = incoming.pipeline_row_id
    JOIN public.foods expected_food
      ON expected_food.source = 'restaurant_official'
     AND expected_food.source_identity_key = incoming.source_identity_key
     AND expected_food.content_hash = incoming.content_hash
    WHERE ROW(
      existing.food_id, existing.pipeline_display_name, existing.source_url,
      existing.authorization_url, existing.source_id, existing.source_sha256,
      existing.page_number, existing.source_section, existing.source_category,
      existing.value_method, existing.evidence, existing.raw_nutrients,
      existing.nutrient_qualifiers
    ) IS DISTINCT FROM ROW(
      expected_food.id, incoming.pipeline_display_name, incoming.source_url,
      incoming.authorization_url, incoming.source_id, incoming.source_sha256,
      incoming.page_number, incoming.source_section, incoming.source_category,
      incoming.value_method, incoming.evidence, incoming.raw_nutrients,
      incoming.nutrient_qualifiers
    )
  ) THEN
    RAISE EXCEPTION 'an existing batch/pipeline row has different provenance'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.food_provenance (
    food_id, import_batch_id, pipeline_row_id, pipeline_display_name,
    source_url, authorization_url, source_id, source_sha256, page_number,
    source_section, source_category, value_method, evidence, raw_nutrients,
    nutrient_qualifiers
  )
  SELECT
    food.id, batch.id, incoming.pipeline_row_id,
    incoming.pipeline_display_name, incoming.source_url,
    incoming.authorization_url, incoming.source_id, incoming.source_sha256,
    incoming.page_number, incoming.source_section, incoming.source_category,
    incoming.value_method, incoming.evidence, incoming.raw_nutrients,
    incoming.nutrient_qualifiers
  FROM pg_temp.restaurant_provenance_stage incoming
  JOIN public.food_import_batches batch USING (batch_key)
  JOIN public.foods food
    ON food.source = 'restaurant_official'
   AND food.source_identity_key = incoming.source_identity_key
   AND food.content_hash = incoming.content_hash
  ON CONFLICT (import_batch_id, pipeline_row_id) DO NOTHING;
  GET DIAGNOSTICS inserted_provenance_count = ROW_COUNT;

  IF (SELECT count(*)
      FROM pg_temp.restaurant_food_stage incoming
      JOIN public.foods food
        ON food.source = 'restaurant_official'
       AND food.source_identity_key = incoming.source_identity_key
       AND food.content_hash = incoming.content_hash) <> food_count
     OR (SELECT count(*)
         FROM pg_temp.restaurant_provenance_stage incoming
         JOIN public.food_import_batches batch USING (batch_key)
         JOIN public.food_provenance provenance
           ON provenance.import_batch_id = batch.id
          AND provenance.pipeline_row_id = incoming.pipeline_row_id) <> provenance_count
  THEN
    RAISE EXCEPTION 'post-import count verification failed';
  END IF;

  RETURN jsonb_build_object(
    'status', CASE
      WHEN inserted_batch_count + inserted_food_count + reactivated_food_count
         + deactivated_food_count + inserted_provenance_count = 0
      THEN 'IDEMPOTENT_REPLAY'
      ELSE 'IMPORTED'
    END,
    'contract', contract_name,
    'batch_rows', chain_count,
    'food_rows', food_count,
    'provenance_rows', provenance_count,
    'inserted_batches', inserted_batch_count,
    'inserted_food_versions', inserted_food_count,
    'reactivated_food_versions', reactivated_food_count,
    'deactivated_food_versions', deactivated_food_count,
    'inserted_provenance', inserted_provenance_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_restaurant_food_bundle(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_restaurant_food_bundle(jsonb)
  TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.food_import_batches
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.food_provenance
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.import_restaurant_food_bundle(jsonb) IS
  'Service-role-only atomic/idempotent receiver for a bounded health-tracker-restaurant-foods-v1 bundle.';

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

COMMIT;
