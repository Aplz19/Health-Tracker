-- Food catalog search/security v2.
--
-- STAGED ONLY: configure SUPABASE_SERVICE_ROLE_KEY for server-side barcode
-- persistence and validate this migration in a non-production project first.
-- Apply after add_vector_search.sql and add_restaurant_food_import.sql.
-- This migration does not generate embeddings; run `npm run generate-embeddings`
-- after it has been applied.

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS search_document text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_tsv tsvector,
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedding_input_hash text,
  ADD COLUMN IF NOT EXISTS embedding_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Infer legacy ownership per food, never from the account count. A manual food
-- linked in exactly one distinct user's library has one defensible owner even
-- when the project has multiple accounts. Ambiguous and unlinked rows stay NULL.
DO $function$
DECLARE
  assigned_count integer;
BEGIN
  WITH unambiguous_library_owner AS (
    SELECT
      library.food_id,
      min(library.user_id::text)::uuid AS owner_id
    FROM public.user_food_library AS library
    GROUP BY library.food_id
    HAVING count(DISTINCT library.user_id) = 1
  )
  UPDATE public.foods AS food
  SET created_by = owner.owner_id
  FROM unambiguous_library_owner AS owner
  WHERE food.id = owner.food_id
    AND food.source = 'manual'
    AND food.created_by IS NULL;

  GET DIAGNOSTICS assigned_count = ROW_COUNT;
  RAISE NOTICE 'Assigned % legacy manual foods from unambiguous library ownership', assigned_count;
END;
$function$;

-- Keep one deterministic normalization rule inside Postgres. POSIX alnum
-- preserves letters and numbers under the database locale while collapsing
-- punctuation/whitespace, so names such as "Taco-Bell" and "taco bell" share
-- the same stored search representation.
CREATE OR REPLACE FUNCTION public.normalize_food_search_text(input_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $function$
  SELECT trim(
    regexp_replace(lower(coalesce(input_text, '')), '[^[:alnum:]]+', ' ', 'g')
  );
$function$;

CREATE OR REPLACE FUNCTION public.refresh_food_search_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  combined_text text;
BEGIN
  combined_text := concat_ws(
    ' ',
    NEW.name,
    NEW.brand,
    replace(NEW.brand_slug, '-', ' '),
    array_to_string(NEW.search_aliases, ' '),
    NEW.variant_label,
    NEW.source_category,
    NEW.serving_size
  );

  NEW.search_document := public.normalize_food_search_text(combined_text);
  NEW.search_tsv := to_tsvector('simple'::regconfig, NEW.search_document);

  -- A vector is valid only for the exact canonical input from which it was
  -- generated. Clear it when any embedding-input field changes; the backfill
  -- script will safely regenerate it later.
  IF TG_OP = 'UPDATE'
     AND ROW(
       OLD.name,
       OLD.brand,
       OLD.brand_slug,
       OLD.search_aliases,
       OLD.variant_label,
       OLD.source_category,
       OLD.serving_size
     ) IS DISTINCT FROM ROW(
       NEW.name,
       NEW.brand,
       NEW.brand_slug,
       NEW.search_aliases,
       NEW.variant_label,
       NEW.source_category,
       NEW.serving_size
     )
  THEN
    NEW.embedding := NULL;
    NEW.embedding_model := NULL;
    NEW.embedding_input_hash := NULL;
    NEW.embedding_updated_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS foods_refresh_search_fields_insert ON public.foods;
CREATE TRIGGER foods_refresh_search_fields_insert
  BEFORE INSERT ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_food_search_fields();

DROP TRIGGER IF EXISTS foods_refresh_search_fields_update ON public.foods;
CREATE TRIGGER foods_refresh_search_fields_update
  BEFORE UPDATE OF
    name,
    brand,
    brand_slug,
    search_aliases,
    variant_label,
    source_category,
    serving_size
  ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_food_search_fields();

-- Backfill the stored lexical fields without touching nutrient or source data.
UPDATE public.foods
SET
  search_document = public.normalize_food_search_text(concat_ws(
    ' ',
    name,
    brand,
    replace(brand_slug, '-', ' '),
    array_to_string(search_aliases, ' '),
    variant_label,
    source_category,
    serving_size
  )),
  search_tsv = to_tsvector(
    'simple'::regconfig,
    public.normalize_food_search_text(concat_ws(
      ' ',
      name,
      brand,
      replace(brand_slug, '-', ' '),
      array_to_string(search_aliases, ' '),
      variant_label,
      source_category,
      serving_size
    ))
  );

ALTER TABLE public.foods
  ALTER COLUMN search_tsv SET NOT NULL;

CREATE INDEX IF NOT EXISTS foods_search_tsv_active_idx
  ON public.foods USING gin (search_tsv)
  WHERE is_active IS TRUE;

CREATE INDEX IF NOT EXISTS foods_search_document_trgm_active_idx
  ON public.foods USING gin (search_document gin_trgm_ops)
  WHERE is_active IS TRUE;

-- The old IVFFlat index was trained with a fixed list count and cannot account
-- for the active-version predicate. HNSW has better recall for this growing
-- catalog and can be built before the final catalog size is known.
DROP INDEX IF EXISTS public.foods_embedding_idx;
CREATE INDEX IF NOT EXISTS foods_embedding_hnsw_active_idx
  ON public.foods USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL AND is_active IS TRUE;

-- True hybrid retrieval: lexical and semantic candidates are independently
-- ranked, then combined with reciprocal-rank fusion. Exact lexical matches get
-- their position through lexical_rank; semantic results can still recover
-- concepts/synonyms. The caller's own library receives only a small tie-break
-- bonus, and auth.uid() is never accepted from caller input.
CREATE OR REPLACE FUNCTION public.search_foods_hybrid(
  search_query text,
  query_embedding vector(1536) DEFAULT NULL,
  embedding_model_param text DEFAULT NULL,
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
  search_rank double precision,
  in_library boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
  WITH params AS MATERIALIZED (
    SELECT
      public.normalize_food_search_text(left(coalesce(search_query, ''), 160)) AS query,
      query_embedding AS embedding,
      nullif(embedding_model_param, '') AS embedding_model,
      least(greatest(coalesce(result_limit, 50), 1), 50) AS result_count,
      least(
        greatest(coalesce(result_limit, 50) * 4, 50),
        200
      ) AS candidate_count
  ),
  lexical_candidates AS MATERIALIZED (
    SELECT
      f.id AS food_id,
      (
        CASE
          WHEN public.normalize_food_search_text(f.name) = p.query THEN 12.0
          WHEN public.normalize_food_search_text(concat_ws(' ', f.brand, f.name)) = p.query THEN 11.0
          WHEN public.normalize_food_search_text(f.brand) = p.query THEN 6.0
          WHEN f.search_document LIKE p.query || '%' THEN 3.0
          ELSE 0.0
        END
        + (4.0 * ts_rank_cd(f.search_tsv, plainto_tsquery('simple'::regconfig, p.query), 32))
        + similarity(f.search_document, p.query)
      )::double precision AS lexical_score
    FROM public.foods f
    CROSS JOIN params p
    WHERE f.is_active IS TRUE
      AND length(p.query) >= 2
      AND (
        f.search_tsv @@ plainto_tsquery('simple'::regconfig, p.query)
        OR f.search_document % p.query
      )
    ORDER BY lexical_score DESC, f.name, f.id
    LIMIT (SELECT candidate_count FROM params)
  ),
  lexical_ranked AS MATERIALIZED (
    SELECT
      food_id,
      row_number() OVER (ORDER BY lexical_score DESC, food_id) AS lexical_rank
    FROM lexical_candidates
  ),
  semantic_nearest AS MATERIALIZED (
    SELECT
      f.id AS food_id,
      (f.embedding <=> p.embedding)::double precision AS cosine_distance
    FROM public.foods f
    CROSS JOIN params p
    WHERE f.is_active IS TRUE
      AND p.embedding IS NOT NULL
      AND p.embedding_model IS NOT NULL
      AND f.embedding IS NOT NULL
      AND f.embedding_model = p.embedding_model
    ORDER BY f.embedding <=> p.embedding
    LIMIT (SELECT candidate_count FROM params)
  ),
  semantic_ranked AS MATERIALIZED (
    SELECT
      food_id,
      row_number() OVER (ORDER BY cosine_distance, food_id) AS semantic_rank
    FROM semantic_nearest
    -- Reject unrelated nearest neighbours while retaining broad food concepts.
    WHERE cosine_distance <= 0.75
  ),
  rank_rows AS (
    SELECT
      food_id,
      (1.25 / (60.0 + lexical_rank))::double precision AS contribution
    FROM lexical_ranked
    UNION ALL
    SELECT
      food_id,
      (1.0 / (60.0 + semantic_rank))::double precision AS contribution
    FROM semantic_ranked
  ),
  fused AS MATERIALIZED (
    SELECT food_id, sum(contribution)::double precision AS rrf_score
    FROM rank_rows
    GROUP BY food_id
  ),
  scored AS MATERIALIZED (
    SELECT
      f.*,
      (
        fused.rrf_score
        + CASE WHEN EXISTS (
            SELECT 1
            FROM public.user_food_library library
            WHERE library.user_id = auth.uid()
              AND library.food_id = f.id
          ) THEN 0.002 ELSE 0.0 END
      )::double precision AS final_score,
      EXISTS (
        SELECT 1
        FROM public.user_food_library library
        WHERE library.user_id = auth.uid()
          AND library.food_id = f.id
      ) AS belongs_to_library
    FROM fused
    JOIN public.foods f ON f.id = fused.food_id
    WHERE f.is_active IS TRUE
  )
  SELECT
    scored.id,
    scored.name,
    scored.brand,
    scored.brand_slug,
    scored.search_aliases,
    scored.source_category,
    scored.variant_label,
    scored.serving_size,
    scored.serving_size_grams::double precision,
    scored.calories::double precision,
    scored.protein::double precision,
    scored.total_fat::double precision,
    scored.saturated_fat::double precision,
    scored.trans_fat::double precision,
    scored.polyunsaturated_fat::double precision,
    scored.monounsaturated_fat::double precision,
    scored.cholesterol::double precision,
    scored.sodium::double precision,
    scored.total_carbohydrates::double precision,
    scored.fiber::double precision,
    scored.sugar::double precision,
    scored.added_sugar::double precision,
    scored.vitamin_a::double precision,
    scored.vitamin_c::double precision,
    scored.vitamin_d::double precision,
    scored.calcium::double precision,
    scored.iron::double precision,
    scored.fdc_id::bigint,
    scored.barcode,
    scored.source,
    scored.source_external_id,
    scored.source_identity_key,
    scored.content_hash,
    scored.is_active,
    scored.verified_at,
    scored.supersedes_food_id,
    scored.created_at,
    scored.updated_at,
    scored.final_score,
    scored.belongs_to_library
  FROM scored
  CROSS JOIN params
  ORDER BY scored.final_score DESC, scored.name, scored.id
  LIMIT (SELECT result_count FROM params);
$function$;

REVOKE ALL ON FUNCTION public.search_foods_hybrid(text, vector, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_foods_hybrid(text, vector, text, integer)
  TO authenticated;

-- Atomic personal-library links. The caller cannot provide a user id, and the
-- target food must be an active catalog row.
CREATE OR REPLACE FUNCTION public.add_food_to_my_library(food_id_param uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  library_id uuid;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.foods
    WHERE id = food_id_param AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'active food not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_food_library AS library (user_id, food_id)
  VALUES (current_user_id, food_id_param)
  ON CONFLICT (user_id, food_id) DO UPDATE
    SET added_at = library.added_at
  RETURNING library.id INTO library_id;

  RETURN library_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_food_from_my_library(food_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  deleted_count integer;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_food_library
  WHERE user_id = current_user_id
    AND food_id = food_id_param;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count > 0;
END;
$function$;

-- Safe create/update contract for user-authored foods. Only an owner-created
-- manual row can be changed; source, verification, version, and provenance
-- fields are never accepted from JSON input. New foods are linked to the
-- caller's library in the same transaction. The migration assigns an existing
-- manual row only when exactly one distinct user's library links to that food;
-- ambiguous and unlinked legacy rows intentionally remain created_by = NULL.
CREATE OR REPLACE FUNCTION public.save_my_manual_food(
  food_id_param uuid,
  food_input jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  current_user_id uuid := auth.uid();
  saved_food_id uuid;
  input_name text;
  input_brand text;
  input_serving_size text;
  input_serving_size_grams numeric;
  input_calories numeric;
  input_protein numeric;
  input_total_fat numeric;
  input_saturated_fat numeric;
  input_trans_fat numeric;
  input_polyunsaturated_fat numeric;
  input_monounsaturated_fat numeric;
  input_cholesterol numeric;
  input_sodium numeric;
  input_total_carbohydrates numeric;
  input_fiber numeric;
  input_sugar numeric;
  input_added_sugar numeric;
  input_vitamin_a numeric;
  input_vitamin_c numeric;
  input_vitamin_d numeric;
  input_calcium numeric;
  input_iron numeric;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF food_input IS NULL OR jsonb_typeof(food_input) <> 'object' THEN
    RAISE EXCEPTION 'food_input must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(food_input) AS supplied(key)
    WHERE supplied.key <> ALL (ARRAY[
      'name', 'brand', 'serving_size', 'serving_size_grams', 'calories',
      'protein', 'total_fat', 'saturated_fat', 'trans_fat',
      'polyunsaturated_fat', 'monounsaturated_fat', 'cholesterol', 'sodium',
      'total_carbohydrates', 'fiber', 'sugar', 'added_sugar', 'vitamin_a',
      'vitamin_c', 'vitamin_d', 'calcium', 'iron'
    ])
  ) THEN
    RAISE EXCEPTION 'food_input contains unsupported fields' USING ERRCODE = '22023';
  END IF;

  input_name := nullif(trim(food_input ->> 'name'), '');
  input_brand := nullif(trim(food_input ->> 'brand'), '');
  input_serving_size := nullif(trim(food_input ->> 'serving_size'), '');
  input_serving_size_grams := (food_input ->> 'serving_size_grams')::numeric;
  input_calories := (food_input ->> 'calories')::numeric;
  input_protein := (food_input ->> 'protein')::numeric;
  input_total_fat := (food_input ->> 'total_fat')::numeric;
  input_saturated_fat := (food_input ->> 'saturated_fat')::numeric;
  input_trans_fat := (food_input ->> 'trans_fat')::numeric;
  input_polyunsaturated_fat := (food_input ->> 'polyunsaturated_fat')::numeric;
  input_monounsaturated_fat := (food_input ->> 'monounsaturated_fat')::numeric;
  input_cholesterol := (food_input ->> 'cholesterol')::numeric;
  input_sodium := (food_input ->> 'sodium')::numeric;
  input_total_carbohydrates := (food_input ->> 'total_carbohydrates')::numeric;
  input_fiber := (food_input ->> 'fiber')::numeric;
  input_sugar := (food_input ->> 'sugar')::numeric;
  input_added_sugar := (food_input ->> 'added_sugar')::numeric;
  input_vitamin_a := (food_input ->> 'vitamin_a')::numeric;
  input_vitamin_c := (food_input ->> 'vitamin_c')::numeric;
  input_vitamin_d := (food_input ->> 'vitamin_d')::numeric;
  input_calcium := (food_input ->> 'calcium')::numeric;
  input_iron := (food_input ->> 'iron')::numeric;

  IF input_name IS NULL OR length(input_name) > 200
     OR input_serving_size IS NULL OR length(input_serving_size) > 120
     OR length(coalesce(input_brand, '')) > 120
     OR input_calories IS NULL
     OR input_protein IS NULL
     OR input_total_fat IS NULL
     OR input_total_carbohydrates IS NULL
  THEN
    RAISE EXCEPTION 'manual food is missing or exceeds required fields'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      input_serving_size_grams, input_calories, input_protein, input_total_fat,
      input_saturated_fat, input_trans_fat, input_polyunsaturated_fat,
      input_monounsaturated_fat, input_cholesterol, input_sodium,
      input_total_carbohydrates, input_fiber, input_sugar, input_added_sugar,
      input_vitamin_a, input_vitamin_c, input_vitamin_d, input_calcium, input_iron
    ]) AS nutrient(value)
    WHERE nutrient.value < 0
  ) THEN
    RAISE EXCEPTION 'nutrient values cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF food_id_param IS NULL THEN
    INSERT INTO public.foods (
      name, brand, serving_size, serving_size_grams, calories, protein,
      total_fat, saturated_fat, trans_fat, polyunsaturated_fat,
      monounsaturated_fat, cholesterol, sodium, total_carbohydrates, fiber,
      sugar, added_sugar, vitamin_a, vitamin_c, vitamin_d, calcium, iron,
      source, created_by, is_active
    ) VALUES (
      input_name, input_brand, input_serving_size, input_serving_size_grams,
      input_calories, input_protein, input_total_fat, input_saturated_fat,
      input_trans_fat, input_polyunsaturated_fat, input_monounsaturated_fat,
      input_cholesterol, input_sodium, input_total_carbohydrates, input_fiber,
      input_sugar, input_added_sugar, input_vitamin_a, input_vitamin_c,
      input_vitamin_d, input_calcium, input_iron, 'manual', current_user_id, TRUE
    )
    RETURNING id INTO saved_food_id;

    INSERT INTO public.user_food_library (user_id, food_id)
    VALUES (current_user_id, saved_food_id)
    ON CONFLICT (user_id, food_id) DO NOTHING;
  ELSE
    UPDATE public.foods
    SET
      name = input_name,
      brand = input_brand,
      serving_size = input_serving_size,
      serving_size_grams = input_serving_size_grams,
      calories = input_calories,
      protein = input_protein,
      total_fat = input_total_fat,
      saturated_fat = input_saturated_fat,
      trans_fat = input_trans_fat,
      polyunsaturated_fat = input_polyunsaturated_fat,
      monounsaturated_fat = input_monounsaturated_fat,
      cholesterol = input_cholesterol,
      sodium = input_sodium,
      total_carbohydrates = input_total_carbohydrates,
      fiber = input_fiber,
      sugar = input_sugar,
      added_sugar = input_added_sugar,
      vitamin_a = input_vitamin_a,
      vitamin_c = input_vitamin_c,
      vitamin_d = input_vitamin_d,
      calcium = input_calcium,
      iron = input_iron,
      updated_at = now()
    WHERE id = food_id_param
      AND source = 'manual'
      AND created_by = current_user_id
      AND is_active IS TRUE
    RETURNING id INTO saved_food_id;

    IF saved_food_id IS NULL THEN
      RAISE EXCEPTION 'owned active manual food not found' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN saved_food_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.add_food_to_my_library(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_food_from_my_library(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_my_manual_food(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_food_to_my_library(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_food_from_my_library(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_my_manual_food(uuid, jsonb) TO authenticated;

-- Direct client writes can otherwise spoof restaurant verification/source data
-- or mutate a global row. Service-role import/backfill jobs bypass these grants.
ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_food_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view foods" ON public.foods;
DROP POLICY IF EXISTS foods_authenticated_read_v2 ON public.foods;
CREATE POLICY foods_authenticated_read_v2
  ON public.foods
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS user_food_library_own_read_v2 ON public.user_food_library;
CREATE POLICY user_food_library_own_read_v2
  ON public.user_food_library
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can insert foods" ON public.foods;
REVOKE SELECT ON public.foods FROM anon;
GRANT SELECT ON public.foods TO authenticated;
GRANT SELECT ON public.user_food_library TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.foods FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_food_library FROM anon, authenticated;

-- Prevent concurrent server-side Open Food Facts lookups from creating more
-- than one active global row for the same barcode.
CREATE UNIQUE INDEX IF NOT EXISTS foods_openfoodfacts_active_barcode_unique
  ON public.foods (barcode)
  WHERE source = 'openfoodfacts' AND is_active IS TRUE AND barcode IS NOT NULL;

COMMENT ON COLUMN public.foods.search_document IS
  'Stored normalized lexical document built from name, brand, aliases, variant, category, and serving.';
COMMENT ON COLUMN public.foods.embedding_input_hash IS
  'SHA-256 of the canonical application embedding input; changes require a new vector.';
COMMENT ON FUNCTION public.search_foods_hybrid(text, vector, text, integer) IS
  'Active-food hybrid lexical/vector retrieval with RRF and auth.uid library tie-breaking.';
COMMENT ON FUNCTION public.save_my_manual_food(uuid, jsonb) IS
  'Creates or updates only the caller-owned manual food fields and atomically links new rows.';

COMMIT;
