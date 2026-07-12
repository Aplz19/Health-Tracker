-- Food catalog search v4.
--
-- Apply after add_food_search_v3.sql. This additive migration gives the app a
-- canonical, field-aware lexical index and a separately versioned RPC. The v3
-- RPC remains available during rollout.

BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

DO $extension_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_extension extension
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = extension.extnamespace
    WHERE extension.extname = 'unaccent'
      AND namespace.nspname <> 'extensions'
  ) THEN
    RAISE EXCEPTION 'unaccent must be installed in the trusted extensions schema';
  END IF;
END;
$extension_check$;

-- Match the application normalizer: remove apostrophes (rather than turning
-- them into word boundaries), fold accents, lowercase, collapse all remaining
-- punctuation to spaces, and trim. The apostrophe regexp is intentionally
-- small: ASCII apostrophe, modifier apostrophe, and
-- left/right curly apostrophes. Two exact replacements repair common UTF-8
-- apostrophe mojibake without deleting those characters from legitimate text.
CREATE OR REPLACE FUNCTION public.normalize_food_search_text(input_text text)
RETURNS text
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, extensions
AS $function$
  SELECT trim(
    regexp_replace(
      lower(
        extensions.unaccent(
          regexp_replace(
            replace(
              replace(coalesce(input_text, ''), 'â€™', ''),
              'â€˜',
              ''
            ),
            '[''’‘ʼ]+',
            '',
            'g'
          )
        )
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$function$;

ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS search_normalized_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_normalized_brand text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_normalized_brand_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_normalized_aliases text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_compact_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_compact_brand text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_compact_brand_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_compact_aliases text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_identity_document text NOT NULL DEFAULT '';

-- One trigger owns every stored search representation. The weighted tsvector
-- deliberately keeps identity fields above descriptive metadata:
--   A: canonical brand plus name (with contiguous positions)
--   B: aliases, generated compact identities, and menu variant
--   C: source/menu category
--   D: serving description
CREATE OR REPLACE FUNCTION public.refresh_food_search_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions
AS $function$
DECLARE
  normalized_slug text;
  normalized_alias_values text;
  compact_alias_values text;
  normalized_variant text;
  normalized_category text;
  normalized_serving text;
BEGIN
  NEW.search_normalized_name := public.normalize_food_search_text(NEW.name);
  NEW.search_normalized_brand := public.normalize_food_search_text(NEW.brand);
  NEW.search_normalized_brand_name := public.normalize_food_search_text(
    concat_ws(' ', NEW.brand, NEW.name)
  );
  NEW.search_compact_name := replace(NEW.search_normalized_name, ' ', '');
  NEW.search_compact_brand := replace(NEW.search_normalized_brand, ' ', '');
  NEW.search_compact_brand_name := replace(
    NEW.search_normalized_brand_name,
    ' ',
    ''
  );

  normalized_slug := public.normalize_food_search_text(
    replace(coalesce(NEW.brand_slug, ''), '-', ' ')
  );

  SELECT
    coalesce(string_agg(alias_row.normalized_alias, ' ' ORDER BY alias_row.ordinality), ''),
    coalesce(string_agg(replace(alias_row.normalized_alias, ' ', '') , ' '
      ORDER BY alias_row.ordinality), '')
  INTO normalized_alias_values, compact_alias_values
  FROM (
    SELECT
      aliases.ordinality,
      public.normalize_food_search_text(aliases.alias_value) AS normalized_alias
    FROM unnest(coalesce(NEW.search_aliases, ARRAY[]::text[]))
      WITH ORDINALITY AS aliases(alias_value, ordinality)
  ) alias_row
  WHERE alias_row.normalized_alias <> '';

  NEW.search_normalized_aliases := concat_ws(
    ' ',
    nullif(normalized_slug, ''),
    nullif(normalized_alias_values, '')
  );
  NEW.search_compact_aliases := concat_ws(
    ' ',
    nullif(replace(normalized_slug, ' ', ''), ''),
    nullif(compact_alias_values, '')
  );

  normalized_variant := public.normalize_food_search_text(NEW.variant_label);
  normalized_category := public.normalize_food_search_text(NEW.source_category);
  normalized_serving := public.normalize_food_search_text(NEW.serving_size);

  -- Fuzzy coverage is restricted to identity text. Descriptive category and
  -- serving words must not make an unrelated brand look like a spelling hit.
  NEW.search_identity_document := concat_ws(
    ' ',
    nullif(NEW.search_normalized_brand, ''),
    nullif(NEW.search_normalized_name, ''),
    nullif(NEW.search_normalized_aliases, ''),
    nullif(NEW.search_compact_brand, ''),
    nullif(NEW.search_compact_name, ''),
    nullif(NEW.search_compact_brand_name, ''),
    nullif(NEW.search_compact_aliases, '')
  );
  NEW.search_document := concat_ws(
    ' ',
    nullif(NEW.search_identity_document, ''),
    nullif(normalized_variant, ''),
    nullif(normalized_category, ''),
    nullif(normalized_serving, '')
  );
  NEW.search_tsv :=
      setweight(
        to_tsvector('simple'::regconfig, NEW.search_normalized_brand_name),
        'A'
      )
    || setweight(
        to_tsvector(
          'simple'::regconfig,
          concat_ws(
            ' ',
            nullif(NEW.search_normalized_aliases, ''),
            nullif(NEW.search_compact_brand, ''),
            nullif(NEW.search_compact_name, ''),
            nullif(NEW.search_compact_brand_name, ''),
            nullif(NEW.search_compact_aliases, ''),
            nullif(normalized_variant, '')
          )
        ),
        'B'
      )
    || setweight(to_tsvector('simple'::regconfig, normalized_category), 'C')
    || setweight(to_tsvector('simple'::regconfig, normalized_serving), 'D');

  -- A vector is valid only for the exact canonical input from which it was
  -- generated. Search-only stored fields do not participate in this check.
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

-- Backfill only search fields. This avoids a no-op update to an input column,
-- which could activate unrelated updated_at or audit triggers.
WITH normalized AS MATERIALIZED (
  SELECT
    food.id,
    public.normalize_food_search_text(food.name) AS normalized_name,
    public.normalize_food_search_text(food.brand) AS normalized_brand,
    public.normalize_food_search_text(
      concat_ws(' ', food.brand, food.name)
    ) AS normalized_brand_name,
    public.normalize_food_search_text(
      replace(coalesce(food.brand_slug, ''), '-', ' ')
    ) AS normalized_slug,
    public.normalize_food_search_text(food.variant_label) AS normalized_variant,
    public.normalize_food_search_text(food.source_category) AS normalized_category,
    public.normalize_food_search_text(food.serving_size) AS normalized_serving,
    coalesce(alias_values.normalized_aliases, '') AS normalized_alias_values,
    coalesce(alias_values.compact_aliases, '') AS compact_alias_values
  FROM public.foods food
  LEFT JOIN LATERAL (
    SELECT
      string_agg(alias_row.normalized_alias, ' ' ORDER BY alias_row.ordinality)
        AS normalized_aliases,
      string_agg(replace(alias_row.normalized_alias, ' ', ''), ' '
        ORDER BY alias_row.ordinality) AS compact_aliases
    FROM (
      SELECT
        aliases.ordinality,
        public.normalize_food_search_text(aliases.alias_value) AS normalized_alias
      FROM unnest(coalesce(food.search_aliases, ARRAY[]::text[]))
        WITH ORDINALITY AS aliases(alias_value, ordinality)
    ) alias_row
    WHERE alias_row.normalized_alias <> ''
  ) alias_values ON TRUE
), prepared AS MATERIALIZED (
  SELECT
    normalized.*,
    concat_ws(
      ' ',
      nullif(normalized.normalized_slug, ''),
      nullif(normalized.normalized_alias_values, '')
    ) AS normalized_aliases,
    concat_ws(
      ' ',
      nullif(replace(normalized.normalized_slug, ' ', ''), ''),
      nullif(normalized.compact_alias_values, '')
    ) AS compact_aliases
  FROM normalized
)
UPDATE public.foods food
SET
  search_normalized_name = prepared.normalized_name,
  search_normalized_brand = prepared.normalized_brand,
  search_normalized_brand_name = prepared.normalized_brand_name,
  search_normalized_aliases = prepared.normalized_aliases,
  search_compact_name = replace(prepared.normalized_name, ' ', ''),
  search_compact_brand = replace(prepared.normalized_brand, ' ', ''),
  search_compact_brand_name = replace(prepared.normalized_brand_name, ' ', ''),
  search_compact_aliases = prepared.compact_aliases,
  search_identity_document = concat_ws(
    ' ',
    nullif(prepared.normalized_brand, ''),
    nullif(prepared.normalized_name, ''),
    nullif(prepared.normalized_aliases, ''),
    nullif(replace(prepared.normalized_brand, ' ', ''), ''),
    nullif(replace(prepared.normalized_name, ' ', ''), ''),
    nullif(replace(prepared.normalized_brand_name, ' ', ''), ''),
    nullif(prepared.compact_aliases, '')
  ),
  search_document = concat_ws(
    ' ',
    nullif(prepared.normalized_brand, ''),
    nullif(prepared.normalized_name, ''),
    nullif(prepared.normalized_aliases, ''),
    nullif(replace(prepared.normalized_brand, ' ', ''), ''),
    nullif(replace(prepared.normalized_name, ' ', ''), ''),
    nullif(replace(prepared.normalized_brand_name, ' ', ''), ''),
    nullif(prepared.compact_aliases, ''),
    nullif(prepared.normalized_variant, ''),
    nullif(prepared.normalized_category, ''),
    nullif(prepared.normalized_serving, '')
  ),
  search_tsv =
      setweight(
        to_tsvector('simple'::regconfig, prepared.normalized_brand_name),
        'A'
      )
    || setweight(
        to_tsvector(
          'simple'::regconfig,
          concat_ws(
            ' ',
            nullif(prepared.normalized_aliases, ''),
            nullif(replace(prepared.normalized_brand, ' ', ''), ''),
            nullif(replace(prepared.normalized_name, ' ', ''), ''),
            nullif(replace(prepared.normalized_brand_name, ' ', ''), ''),
            nullif(prepared.compact_aliases, ''),
            nullif(prepared.normalized_variant, '')
          )
        ),
        'B'
      )
    || setweight(
        to_tsvector('simple'::regconfig, prepared.normalized_category),
        'C'
      )
    || setweight(
        to_tsvector('simple'::regconfig, prepared.normalized_serving),
        'D'
      )
FROM prepared
WHERE food.id = prepared.id;

-- Prefix indexes serve deterministic identity tiers. Trigram indexes serve
-- bounded spelling recovery and compact no-space input. The existing active
-- search_tsv/search_document indexes remain valid after the backfill.
CREATE INDEX IF NOT EXISTS foods_search_normalized_name_prefix_active_idx
  ON public.foods (search_normalized_name text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_normalized_brand_prefix_active_idx
  ON public.foods (search_normalized_brand text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_normalized_brand_name_prefix_active_idx
  ON public.foods (search_normalized_brand_name text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_compact_name_prefix_active_idx
  ON public.foods (search_compact_name text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_compact_brand_prefix_active_idx
  ON public.foods (search_compact_brand text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_compact_brand_name_prefix_active_idx
  ON public.foods (search_compact_brand_name text_pattern_ops)
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_compact_aliases_trgm_active_idx
  ON public.foods USING gin (
    search_compact_aliases extensions.gin_trgm_ops
  )
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_compact_brand_name_trgm_active_idx
  ON public.foods USING gin (
    search_compact_brand_name extensions.gin_trgm_ops
  )
  WHERE is_active IS TRUE;
CREATE INDEX IF NOT EXISTS foods_search_identity_document_trgm_active_idx
  ON public.foods USING gin (
    search_identity_document extensions.gin_trgm_ops
  )
  WHERE is_active IS TRUE;

CREATE OR REPLACE FUNCTION public.search_foods_v4(
  search_query text,
  query_embedding extensions.vector(1536) DEFAULT NULL,
  embedding_model_param text DEFAULT NULL,
  result_limit integer DEFAULT 50,
  result_offset integer DEFAULT 0,
  exclude_library_param boolean DEFAULT false
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
  match_tier integer,
  in_library boolean,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
SET pg_trgm.word_similarity_threshold = '0.45'
AS $function$
  WITH query_base AS MATERIALIZED (
    SELECT
      trim(left(public.normalize_food_search_text(search_query), 120)) AS query,
      query_embedding AS embedding,
      nullif(embedding_model_param, '') AS embedding_model,
      least(greatest(coalesce(result_limit, 50), 1), 50) AS result_count,
      least(greatest(coalesce(result_offset, 0), 0), 5000) AS page_offset,
      coalesce(exclude_library_param, false) AS exclude_library
  ),
  query_tokens AS MATERIALIZED (
    SELECT split.token, split.token_position
    FROM query_base base
    CROSS JOIN LATERAL regexp_split_to_table(base.query, '[[:space:]]+')
      WITH ORDINALITY AS split(token, token_position)
    WHERE split.token <> ''
      AND split.token_position <= 8
  ),
  params AS MATERIALIZED (
    SELECT
      base.*,
      replace(base.query, ' ', '') AS compact_query,
      (SELECT count(*)::integer FROM query_tokens) AS token_count,
      (
        SELECT count(*)::integer
        FROM query_tokens tokens
        WHERE length(tokens.token) >= 3
      ) AS fuzzy_token_count,
      (
        SELECT tokens.token
        FROM query_tokens tokens
        WHERE length(tokens.token) >= 3
        ORDER BY length(tokens.token) DESC, tokens.token_position
        LIMIT 1
      ) AS fuzzy_anchor,
      (
        SELECT CASE
          WHEN count(*) = 0 THEN NULL::tsquery
          ELSE to_tsquery(
            'simple'::regconfig,
            string_agg(
              quote_literal(tokens.token) || ':*',
              ' & ' ORDER BY tokens.token_position
            )
          )
        END
        FROM query_tokens tokens
      ) AS prefix_query,
      (
        SELECT CASE
          WHEN count(*) = 0 THEN NULL::tsquery
          ELSE to_tsquery(
            'simple'::regconfig,
            string_agg(
              quote_literal(tokens.token) || ':*',
              ' <-> ' ORDER BY tokens.token_position
            )
          )
        END
        FROM query_tokens tokens
      ) AS ordered_prefix_query,
      -- A fixed bound keeps the candidate universe (and total_count) stable
      -- across pages. It must not grow as result_offset grows.
      1000 AS fuzzy_candidate_count
    FROM query_base base
  ),
  -- Explicit visibility predicates provide defense in depth; SECURITY INVOKER
  -- means the foods and library RLS policies remain authoritative as well.
  eligible_foods AS NOT MATERIALIZED (
    SELECT food.*
    FROM public.foods food
    CROSS JOIN params
    WHERE food.is_active IS TRUE
      AND (food.source <> 'manual' OR food.created_by = auth.uid())
      AND (
        params.exclude_library IS FALSE
        OR NOT EXISTS (
          SELECT 1
          FROM public.user_food_library library
          WHERE library.user_id = auth.uid()
            AND library.food_id = food.id
        )
      )
  ),
  -- Exact and contiguous prefixes have a separate index-friendly admission
  -- lane. Compact fields make "tacobell" equivalent to "taco bell" without a
  -- restaurant-specific rule.
  structured_admitted AS MATERIALIZED (
    SELECT food.id AS food_id
    FROM eligible_foods food
    CROSS JOIN params
    WHERE length(params.query) >= 2
      AND (
        food.search_normalized_name = params.query
        OR food.search_normalized_brand = params.query
        OR food.search_normalized_brand_name = params.query
        OR food.search_compact_name = params.compact_query
        OR food.search_compact_brand = params.compact_query
        OR food.search_compact_brand_name = params.compact_query
        OR food.search_normalized_name LIKE params.query || '%'
        OR food.search_normalized_brand LIKE params.query || '%'
        OR food.search_normalized_brand_name LIKE params.query || '%'
        OR food.search_compact_name LIKE params.compact_query || '%'
        OR food.search_compact_brand LIKE params.compact_query || '%'
        OR food.search_compact_brand_name LIKE params.compact_query || '%'
        OR (
          length(params.compact_query) >= 3
          AND food.search_compact_aliases LIKE '%' || params.compact_query || '%'
        )
      )
  ),
  -- Every normalized token must match a lexeme prefix. This lane is indexed by
  -- the active partial GIN index and is order-independent.
  prefix_admitted AS MATERIALIZED (
    SELECT
      food.id AS food_id,
      ts_rank_cd(
        ARRAY[0.05, 0.2, 0.6, 1.0]::real[],
        food.search_tsv,
        params.prefix_query,
        32
      )::double precision AS prefix_rank,
      (
        params.ordered_prefix_query IS NOT NULL
        AND food.search_tsv @@ params.ordered_prefix_query
      ) AS ordered_prefix_match
    FROM eligible_foods food
    CROSS JOIN params
    WHERE length(params.query) >= 2
      AND params.prefix_query IS NOT NULL
      AND food.search_tsv @@ params.prefix_query
  ),
  -- Fuzzy matching is deliberately token-aware. A single token must be at
  -- least five characters and score >= .55. Multi-token input may use .45,
  -- but every meaningful token must independently be covered by the document.
  -- The longest meaningful token is an indexed admission anchor.
  typo_admitted AS MATERIALIZED (
    SELECT
      food.id AS food_id,
      greatest(
        token_scores.average_score,
        extensions.similarity(food.search_compact_name, params.compact_query),
        extensions.similarity(
          food.search_compact_brand_name,
          params.compact_query
        )
      )::double precision AS typo_score
    FROM eligible_foods food
    CROSS JOIN params
    CROSS JOIN LATERAL (
      SELECT
        min(extensions.word_similarity(
          tokens.token,
          food.search_identity_document
        ))
          AS minimum_score,
        avg(extensions.word_similarity(
          tokens.token,
          food.search_identity_document
        ))
          AS average_score
      FROM query_tokens tokens
      WHERE length(tokens.token) >= 3
    ) token_scores
    WHERE params.fuzzy_anchor IS NOT NULL
      -- Typo recovery is a fallback lane, not a source of extra low-quality
      -- rows after deterministic exact/prefix retrieval has already worked.
      AND NOT EXISTS (SELECT 1 FROM structured_admitted)
      AND NOT EXISTS (SELECT 1 FROM prefix_admitted)
      AND (
        food.search_identity_document
          OPERATOR(extensions.%>) params.fuzzy_anchor
        OR (
          params.token_count = 1
          AND length(params.compact_query) >= 5
          AND (
            food.search_compact_name OPERATOR(extensions.%) params.compact_query
            OR food.search_compact_brand_name
              OPERATOR(extensions.%) params.compact_query
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM query_tokens short_token
        WHERE length(short_token.token) < 3
          AND NOT (
            to_tsvector(
              'simple'::regconfig,
              food.search_identity_document
            ) @@ to_tsquery(
              'simple'::regconfig,
              quote_literal(short_token.token) || ':*'
            )
          )
      )
      AND (
        (
          params.token_count = 1
          AND length(params.fuzzy_anchor) >= 5
          AND token_scores.minimum_score >= 0.55
        )
        OR (
          params.token_count > 1
          AND params.fuzzy_token_count >= 1
          AND token_scores.minimum_score >= 0.45
        )
      )
    ORDER BY typo_score DESC, food.search_normalized_name, food.id
    LIMIT (SELECT fuzzy_candidate_count FROM params)
  ),
  semantic_admitted AS MATERIALIZED (
    SELECT
      food.id AS food_id,
      (
        food.embedding OPERATOR(extensions.<=>) params.embedding
      )::double precision AS cosine_distance
    FROM eligible_foods food
    CROSS JOIN params
    WHERE params.embedding IS NOT NULL
      AND params.embedding_model IS NOT NULL
      AND food.embedding IS NOT NULL
      AND food.embedding_model = params.embedding_model
    ORDER BY food.embedding OPERATOR(extensions.<=>) params.embedding, food.id
    LIMIT (SELECT fuzzy_candidate_count FROM params)
  ),
  candidate_rows AS (
    SELECT
      food_id,
      true AS structured_match,
      NULL::double precision AS prefix_rank,
      false AS ordered_prefix_match,
      NULL::double precision AS typo_score,
      NULL::double precision AS semantic_similarity
    FROM structured_admitted
    UNION ALL
    SELECT food_id, false, prefix_rank, ordered_prefix_match, NULL, NULL
    FROM prefix_admitted
    UNION ALL
    SELECT food_id, false, NULL, false, typo_score, NULL
    FROM typo_admitted
    UNION ALL
    SELECT
      food_id,
      false,
      NULL,
      false,
      NULL,
      (1.0 - cosine_distance)::double precision
    FROM semantic_admitted
    WHERE cosine_distance <= 0.75
  ),
  candidates AS MATERIALIZED (
    SELECT
      candidate_rows.food_id,
      bool_or(candidate_rows.structured_match) AS structured_match,
      max(candidate_rows.prefix_rank)::double precision AS prefix_rank,
      bool_or(candidate_rows.ordered_prefix_match) AS ordered_prefix_match,
      max(candidate_rows.typo_score)::double precision AS typo_score,
      max(candidate_rows.semantic_similarity)::double precision
        AS semantic_similarity
    FROM candidate_rows
    GROUP BY candidate_rows.food_id
  ),
  features AS MATERIALIZED (
    SELECT
      food.*,
      candidates.structured_match,
      candidates.ordered_prefix_match,
      coalesce(candidates.prefix_rank, 0.0) AS prefix_rank,
      coalesce(candidates.typo_score, 0.0) AS typo_score,
      coalesce(candidates.semantic_similarity, 0.0) AS semantic_similarity,
      (
        food.search_normalized_brand_name = params.query
        OR food.search_compact_brand_name = params.compact_query
      ) AS exact_brand_name,
      (
        food.search_normalized_name = params.query
        OR food.search_compact_name = params.compact_query
      ) AS exact_name,
      (
        food.search_normalized_brand = params.query
        OR food.search_compact_brand = params.compact_query
      ) AS exact_brand,
      (
        food.search_normalized_brand LIKE params.query || '%'
        OR food.search_compact_brand LIKE params.compact_query || '%'
      ) AS brand_prefix,
      (
        food.search_normalized_brand_name LIKE params.query || '%'
        OR food.search_compact_brand_name LIKE params.compact_query || '%'
      ) AS ordered_brand_name_prefix,
      (
        food.search_normalized_name LIKE params.query || '%'
        OR food.search_compact_name LIKE params.compact_query || '%'
      ) AS ordered_name_prefix,
      coalesce(alias_match.alias_exact, false) AS alias_exact,
      coalesce(alias_match.alias_prefix, false) AS alias_prefix,
      EXISTS (
        SELECT 1
        FROM public.user_food_library library
        WHERE library.user_id = auth.uid()
          AND library.food_id = food.id
      ) AS belongs_to_library
    FROM candidates
    JOIN eligible_foods food ON food.id = candidates.food_id
    CROSS JOIN params
    LEFT JOIN LATERAL (
      SELECT
        bool_or(
          normalized_alias = params.query
          OR compact_alias = params.compact_query
        ) AS alias_exact,
        bool_or(
          normalized_alias LIKE params.query || '%'
          OR compact_alias LIKE params.compact_query || '%'
        ) AS alias_prefix
      FROM (
        SELECT
          public.normalize_food_search_text(aliases.alias_value)
            AS normalized_alias,
          replace(
            public.normalize_food_search_text(aliases.alias_value),
            ' ',
            ''
          ) AS compact_alias
        FROM unnest(coalesce(food.search_aliases, ARRAY[]::text[]))
          AS aliases(alias_value)
        UNION ALL
        SELECT
          public.normalize_food_search_text(
            replace(coalesce(food.brand_slug, ''), '-', ' ')
          ),
          replace(
            public.normalize_food_search_text(
              replace(coalesce(food.brand_slug, ''), '-', ' ')
            ),
            ' ',
            ''
          )
      ) normalized_alias_rows
      WHERE normalized_alias <> ''
    ) alias_match ON TRUE
  ),
  tiered AS MATERIALIZED (
    SELECT
      features.*,
      CASE
        WHEN features.exact_brand_name OR features.exact_name THEN 1
        WHEN features.exact_brand
          OR features.alias_exact
          OR features.brand_prefix
          OR features.alias_prefix THEN 2
        WHEN features.structured_match OR features.prefix_rank > 0.0 THEN 3
        WHEN features.typo_score > 0.0 THEN 4
        ELSE 5
      END AS result_match_tier,
      CASE
        WHEN features.exact_brand_name THEN 4
        WHEN features.exact_name THEN 3
        WHEN features.exact_brand THEN 2
        WHEN features.alias_exact THEN 1
        ELSE 0
      END AS exact_quality,
      CASE
        WHEN features.ordered_prefix_match THEN 4
        WHEN features.ordered_brand_name_prefix THEN 3
        WHEN features.ordered_name_prefix THEN 2
        WHEN features.brand_prefix OR features.alias_prefix THEN 1
        ELSE 0
      END AS ordered_quality
    FROM features
  ),
  scored AS MATERIALIZED (
    SELECT
      tiered.*,
      (
        ((6 - tiered.result_match_tier) * 1000000.0)
        + (tiered.exact_quality * 10000.0)
        + (tiered.ordered_quality * 1000.0)
        + (tiered.prefix_rank * 100.0)
        + (tiered.typo_score * 10.0)
        + tiered.semantic_similarity
      )::double precision AS final_score
    FROM tiered
  ),
  counted AS MATERIALIZED (
    SELECT scored.*, count(*) OVER ()::bigint AS matched_count
    FROM scored
  )
  SELECT
    counted.id,
    counted.name,
    counted.brand,
    counted.brand_slug,
    counted.search_aliases,
    counted.source_category,
    counted.variant_label,
    counted.serving_size,
    counted.serving_size_grams::double precision,
    counted.calories::double precision,
    counted.protein::double precision,
    counted.total_fat::double precision,
    counted.saturated_fat::double precision,
    counted.trans_fat::double precision,
    counted.polyunsaturated_fat::double precision,
    counted.monounsaturated_fat::double precision,
    counted.cholesterol::double precision,
    counted.sodium::double precision,
    counted.total_carbohydrates::double precision,
    counted.fiber::double precision,
    counted.sugar::double precision,
    counted.added_sugar::double precision,
    counted.vitamin_a::double precision,
    counted.vitamin_c::double precision,
    counted.vitamin_d::double precision,
    counted.calcium::double precision,
    counted.iron::double precision,
    counted.fdc_id::bigint,
    counted.barcode,
    counted.source,
    counted.source_external_id,
    counted.source_identity_key,
    counted.content_hash,
    counted.is_active,
    counted.verified_at,
    counted.supersedes_food_id,
    counted.created_at,
    counted.updated_at,
    counted.final_score,
    counted.result_match_tier,
    counted.belongs_to_library,
    counted.matched_count
  FROM counted
  CROSS JOIN params
  ORDER BY
    counted.result_match_tier,
    counted.exact_quality DESC,
    counted.ordered_quality DESC,
    counted.prefix_rank DESC,
    counted.typo_score DESC,
    counted.semantic_similarity DESC,
    counted.search_normalized_brand,
    counted.search_normalized_name,
    counted.id
  LIMIT (SELECT result_count FROM params)
  OFFSET (SELECT page_offset FROM params);
$function$;

REVOKE ALL ON FUNCTION public.search_foods_v4(
  text,
  extensions.vector,
  text,
  integer,
  integer,
  boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_foods_v4(
  text,
  extensions.vector,
  text,
  integer,
  integer,
  boolean
) TO authenticated;

COMMENT ON FUNCTION public.search_foods_v4(
  text,
  extensions.vector,
  text,
  integer,
  integer,
  boolean
) IS
  'Authenticated food search v4: canonical weighted lexical retrieval, bounded tokenwise typo recovery, optional semantic fallback, stable pagination, and caller-selected library exclusion.';

COMMENT ON COLUMN public.foods.search_normalized_name IS
  'Canonical accent-folded/apostrophe-free food name used for exact and prefix search.';
COMMENT ON COLUMN public.foods.search_normalized_brand IS
  'Canonical accent-folded/apostrophe-free brand used for exact and prefix search.';
COMMENT ON COLUMN public.foods.search_normalized_brand_name IS
  'Canonical brand plus food name used for ordered query ranking.';
COMMENT ON COLUMN public.foods.search_compact_brand_name IS
  'Whitespace-free canonical brand plus name used for equivalent compact input.';
COMMENT ON COLUMN public.foods.search_identity_document IS
  'Identity-only normalized brand, name, aliases, and compact variants used for fuzzy coverage.';
COMMENT ON COLUMN public.foods.search_tsv IS
  'Weighted search vector: canonical brand/name A; aliases, compact identity, and variant B; category C; serving D.';

COMMIT;
