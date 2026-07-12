-- Read-only production/staging verification for add_food_search_v4.sql.
--
-- This is a judged regression set, not restaurant-specific search logic. The
-- examples exercise generic brand prefixes, compact aliases, ordered item
-- prefixes, punctuation/whitespace normalization, and bounded typo recovery.

WITH cases (
  query,
  expected_brand,
  expected_name_pattern,
  maximum_position,
  minimum_total,
  require_top_brand
) AS (
  VALUES
    ('qd', 'Qdoba', NULL::text, 1, 100, TRUE),
    ('QdoB', 'Qdoba', NULL, 1, 100, TRUE),
    ('  CHIPOTLE  ', 'Chipotle', NULL, 1, 100, TRUE),
    ('red rob whis', 'Red Robin', 'whiskey%', 3, 1, FALSE),
    ('chik fil nug', 'Chick-fil-A', '%nug%', 1, 1, FALSE),
    ('chik f nug', 'Chick-fil-A', '%nug%', 1, 1, FALSE),
    ('tacobell crunch', 'Taco Bell', '%crunch%', 10, 1, FALSE),
    ('grilled chick', NULL, 'grilled chick%', 3, 1, FALSE),
    ('burito', NULL, '%burrito%', 10, 1, FALSE),
    ('chicken sandwich', NULL, '%chicken sandwich%', 3, 1, FALSE)
),
ranked AS MATERIALIZED (
  SELECT
    cases.*,
    result.brand,
    result.name,
    result.total_count,
    result.ordinality::integer AS result_position
  FROM cases
  CROSS JOIN LATERAL public.search_foods_v4(
    cases.query,
    NULL,
    NULL,
    10,
    0,
    FALSE
  ) WITH ORDINALITY AS result
)
SELECT
  cases.query,
  max(ranked.total_count) AS total_count,
  min(ranked.result_position) FILTER (
    WHERE (cases.expected_brand IS NULL OR ranked.brand = cases.expected_brand)
      AND (
        cases.expected_name_pattern IS NULL
        OR public.normalize_food_search_text(ranked.name)
          LIKE cases.expected_name_pattern
      )
  ) AS first_expected_position,
  coalesce(
    bool_and(ranked.brand = cases.expected_brand) FILTER (
      WHERE ranked.result_position <= 10
    ),
    FALSE
  ) AS top_results_have_expected_brand,
  (
    coalesce(max(ranked.total_count), 0) >= cases.minimum_total
    AND coalesce(
      bool_or(
        ranked.result_position <= cases.maximum_position
        AND (cases.expected_brand IS NULL OR ranked.brand = cases.expected_brand)
        AND (
          cases.expected_name_pattern IS NULL
          OR public.normalize_food_search_text(ranked.name)
            LIKE cases.expected_name_pattern
        )
      ),
      FALSE
    )
    AND (
      NOT cases.require_top_brand
      OR coalesce(
        bool_and(ranked.brand = cases.expected_brand) FILTER (
          WHERE ranked.result_position <= 10
        ),
        FALSE
      )
    )
  ) AS passed
FROM cases
LEFT JOIN ranked ON ranked.query = cases.query
GROUP BY
  cases.query,
  cases.expected_brand,
  cases.expected_name_pattern,
  cases.maximum_position,
  cases.minimum_total,
  cases.require_top_brand
ORDER BY cases.query;

-- Canonical normalization must agree with the browser contract.
WITH normalization_cases (input, expected) AS (
  VALUES
    ('McDonald''s', 'mcdonalds'),
    ('Papa John’s', 'papa johns'),
    ('Crème brûlée', 'creme brulee'),
    ('Chick-fil-A', 'chick fil a'),
    ('  CHIPOTLE  ', 'chipotle')
)
SELECT
  input,
  expected,
  public.normalize_food_search_text(input) AS actual,
  public.normalize_food_search_text(input) = expected AS passed
FROM normalization_cases;

-- Pagination must be complete, stable, and overlap-free.
WITH first_page AS MATERIALIZED (
  SELECT id, total_count
  FROM public.search_foods_v4('red robin', NULL, NULL, 50, 0, FALSE)
),
second_page AS MATERIALIZED (
  SELECT id, total_count
  FROM public.search_foods_v4('red robin', NULL, NULL, 50, 50, FALSE)
)
SELECT
  (SELECT count(*) FROM first_page) AS first_page_rows,
  (SELECT count(*) FROM second_page) AS second_page_rows,
  (SELECT max(total_count) FROM first_page) AS total_count,
  (
    SELECT count(*)
    FROM first_page
    JOIN second_page USING (id)
  ) AS page_overlap,
  (
    (SELECT count(*) FROM first_page) = 50
    AND (SELECT count(*) FROM second_page) = 50
    AND (SELECT max(total_count) FROM first_page) >= 100
    AND (SELECT max(total_count) FROM first_page)
      = (SELECT max(total_count) FROM second_page)
    AND NOT EXISTS (
      SELECT 1
      FROM first_page
      JOIN second_page USING (id)
    )
  ) AS passed;

-- Search fields, permissions, and active catalog invariants.
SELECT
  count(*) FILTER (
    WHERE search_normalized_name IS NULL
      OR search_normalized_brand IS NULL
      OR search_normalized_brand_name IS NULL
      OR search_normalized_aliases IS NULL
      OR search_compact_name IS NULL
      OR search_compact_brand IS NULL
      OR search_compact_brand_name IS NULL
      OR search_compact_aliases IS NULL
      OR search_identity_document IS NULL
      OR search_document = ''
      OR search_tsv IS NULL
  ) AS active_rows_missing_search_fields,
  has_function_privilege(
    'authenticated',
    'public.search_foods_v4(text,extensions.vector,text,integer,integer,boolean)',
    'EXECUTE'
  ) AS authenticated_can_execute,
  has_function_privilege(
    'anon',
    'public.search_foods_v4(text,extensions.vector,text,integer,integer,boolean)',
    'EXECUTE'
  ) AS anonymous_can_execute
FROM public.foods
WHERE is_active IS TRUE;
