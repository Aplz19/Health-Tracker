-- Food catalog search v3.
--
-- Apply after add_food_search_v2.sql. This additive migration keeps the RPC
-- contract unchanged while making lexical retrieval tolerant of incomplete
-- words, harmless surrounding whitespace, and bounded spelling mistakes.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_foods_hybrid(
  search_query text,
  query_embedding extensions.vector(1536) DEFAULT NULL,
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
  WITH query_base AS MATERIALIZED (
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
  -- Construct syntax only from normalized tokens. quote_literal protects the
  -- tsquery grammar, and the hard token cap bounds parser/planner work.
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
      ) AS prefix_query
    FROM query_base base
  ),
  -- Keep prefix admission on the stored GIN-indexed tsvector. A separate
  -- bounded lane lets the planner use that index without a broad OR predicate.
  prefix_admitted AS MATERIALIZED (
    SELECT
      f.id AS food_id,
      ts_rank_cd(f.search_tsv, p.prefix_query, 32)::double precision AS prefix_rank
    FROM public.foods f
    CROSS JOIN params p
    WHERE f.is_active IS TRUE
      AND (f.source <> 'manual' OR f.created_by = auth.uid())
      AND length(p.query) >= 2
      AND p.prefix_query IS NOT NULL
      AND f.search_tsv @@ p.prefix_query
    ORDER BY prefix_rank DESC, f.name, f.id
    LIMIT (SELECT candidate_count FROM params)
  ),
  -- The existing GIN pg_trgm index also supports the word-similarity operator.
  -- This lane supplements prefixes for misspellings inside a longer document.
  typo_admitted AS MATERIALIZED (
    SELECT
      f.id AS food_id,
      greatest(
        extensions.similarity(f.name, p.query),
        extensions.similarity(coalesce(f.brand, ''), p.query),
        extensions.word_similarity(p.query, f.search_document)
      )::double precision AS typo_score
    FROM public.foods f
    CROSS JOIN params p
    WHERE f.is_active IS TRUE
      AND (f.source <> 'manual' OR f.created_by = auth.uid())
      AND length(p.query) >= 3
      AND (SELECT count(*) FROM query_tokens) = 1
      AND (
        f.name OPERATOR(extensions.%) p.query
        OR f.brand OPERATOR(extensions.%) p.query
        OR f.search_document OPERATOR(extensions.%>) p.query
      )
    ORDER BY typo_score DESC, f.name, f.id
    LIMIT (SELECT candidate_count FROM params)
  ),
  lexical_admitted AS MATERIALIZED (
    SELECT
      admitted.food_id,
      max(admitted.prefix_rank)::double precision AS prefix_rank,
      max(admitted.typo_score)::double precision AS typo_score
    FROM (
      SELECT food_id, prefix_rank, NULL::double precision AS typo_score
      FROM prefix_admitted
      UNION ALL
      SELECT food_id, NULL::double precision AS prefix_rank, typo_score
      FROM typo_admitted
    ) admitted
    GROUP BY admitted.food_id
  ),
  lexical_candidates AS MATERIALIZED (
    SELECT
      f.id AS food_id,
      (
        CASE WHEN structured.normalized_name = p.query THEN 18.0 ELSE 0.0 END
        + CASE WHEN structured.normalized_brand_name = p.query THEN 17.0 ELSE 0.0 END
        + CASE WHEN structured.normalized_brand = p.query THEN 14.0 ELSE 0.0 END
        + CASE WHEN coalesce(aliases.alias_exact, FALSE) THEN 13.0 ELSE 0.0 END
        + CASE
            WHEN structured.normalized_brand_name <> p.query
              AND structured.normalized_brand_name LIKE p.query || '%'
              THEN 10.0
            ELSE 0.0
          END
        + CASE
            WHEN structured.normalized_brand <> p.query
              AND structured.normalized_brand LIKE p.query || '%'
              THEN 9.0
            ELSE 0.0
          END
        + CASE
            WHEN structured.normalized_name <> p.query
              AND structured.normalized_name LIKE p.query || '%'
              THEN 8.0
            ELSE 0.0
          END
        + CASE
            WHEN coalesce(aliases.alias_prefix, FALSE)
              AND NOT coalesce(aliases.alias_exact, FALSE)
              THEN 7.0
            ELSE 0.0
          END
        + (4.0 * coalesce(admitted.prefix_rank, 0.0))
        + (3.0 * coalesce(admitted.typo_score, 0.0))
      )::double precision AS lexical_score
    FROM lexical_admitted admitted
    JOIN public.foods f ON f.id = admitted.food_id
    CROSS JOIN params p
    CROSS JOIN LATERAL (
      SELECT
        public.normalize_food_search_text(f.name) AS normalized_name,
        public.normalize_food_search_text(f.brand) AS normalized_brand,
        public.normalize_food_search_text(concat_ws(' ', f.brand, f.name)) AS normalized_brand_name
    ) structured
    LEFT JOIN LATERAL (
      SELECT
        bool_or(normalized.alias_text = p.query) AS alias_exact,
        bool_or(normalized.alias_text LIKE p.query || '%') AS alias_prefix
      FROM (
        SELECT public.normalize_food_search_text(alias_value) AS alias_text
        FROM unnest(coalesce(f.search_aliases, ARRAY[]::text[])) AS alias_rows(alias_value)
      ) normalized
    ) aliases ON TRUE
    WHERE f.is_active IS TRUE
      AND (f.source <> 'manual' OR f.created_by = auth.uid())
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
      (f.embedding OPERATOR(extensions.<=>) p.embedding)::double precision AS cosine_distance
    FROM public.foods f
    CROSS JOIN params p
    WHERE f.is_active IS TRUE
      AND (f.source <> 'manual' OR f.created_by = auth.uid())
      AND p.embedding IS NOT NULL
      AND p.embedding_model IS NOT NULL
      AND f.embedding IS NOT NULL
      AND f.embedding_model = p.embedding_model
    ORDER BY f.embedding OPERATOR(extensions.<=>) p.embedding
    LIMIT (SELECT candidate_count FROM params)
  ),
  semantic_ranked AS MATERIALIZED (
    SELECT
      food_id,
      row_number() OVER (ORDER BY cosine_distance, food_id) AS semantic_rank
    FROM semantic_nearest
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
      AND (f.source <> 'manual' OR f.created_by = auth.uid())
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

REVOKE ALL ON FUNCTION public.search_foods_hybrid(text, extensions.vector, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_foods_hybrid(text, extensions.vector, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.search_foods_hybrid(text, extensions.vector, text, integer) IS
  'Authenticated hybrid catalog search v3: indexed token prefixes, bounded word-typo recovery, semantic recall, and RRF ranking.';

COMMIT;
