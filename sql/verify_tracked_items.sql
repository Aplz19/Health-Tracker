-- Verify add_tracked_items.sql actually copied everything.
-- READ-ONLY. Returns a real result grid (the migration's own checks used
-- RAISE NOTICE, which the Supabase SQL editor usually doesn't display).
--
-- Every row should read OK, with matching row counts and identical date ranges.

WITH legacy AS (
  SELECT 'Creatine'    AS name, count(*) AS rows, min(date) AS first_day, max(date) AS last_day FROM creatine_logs
  UNION ALL SELECT 'Fish Oil',    count(*), min(date), max(date) FROM fish_oil_logs
  UNION ALL SELECT 'Vitamin D3',  count(*), min(date), max(date) FROM d3_logs
  UNION ALL SELECT 'Vitamin K2',  count(*), min(date), max(date) FROM k2_logs
  UNION ALL SELECT 'Vitamin C',   count(*), min(date), max(date) FROM vitamin_c_logs
  UNION ALL SELECT 'Vitamin A',   count(*), min(date), max(date) FROM vitamin_a_logs
  UNION ALL SELECT 'Vitamin E',   count(*), min(date), max(date) FROM vitamin_e_logs
  UNION ALL SELECT 'Vitamin B12', count(*), min(date), max(date) FROM vitamin_b12_logs
  UNION ALL SELECT 'B Complex',   count(*), min(date), max(date) FROM vitamin_b_complex_logs
  UNION ALL SELECT 'Folate',      count(*), min(date), max(date) FROM folate_logs
  UNION ALL SELECT 'Biotin',      count(*), min(date), max(date) FROM biotin_logs
  UNION ALL SELECT 'Zinc',        count(*), min(date), max(date) FROM zinc_logs
  UNION ALL SELECT 'Magnesium',   count(*), min(date), max(date) FROM magnesium_logs
  UNION ALL SELECT 'Melatonin',   count(*), min(date), max(date) FROM melatonin_logs
  UNION ALL SELECT 'Caffeine',    count(*), min(date), max(date) FROM caffeine_logs
),
migrated AS (
  SELECT i.name,
         count(*) AS rows,
         min(l.date) AS first_day,
         max(l.date) AS last_day
  FROM tracked_item_logs l
  JOIN user_tracked_items i ON i.id = l.item_id
  WHERE i.kind = 'supplement'
  GROUP BY i.name
)
SELECT
  COALESCE(le.name, m.name)                                   AS supplement,
  COALESCE(le.rows, 0)                                        AS legacy_rows,
  COALESCE(m.rows, 0)                                         AS migrated_rows,
  CASE
    WHEN COALESCE(le.rows, 0) = 0 AND COALESCE(m.rows, 0) = 0 THEN 'empty'
    WHEN COALESCE(le.rows, 0) = COALESCE(m.rows, 0)
     AND le.first_day IS NOT DISTINCT FROM m.first_day
     AND le.last_day  IS NOT DISTINCT FROM m.last_day         THEN 'OK'
    ELSE '*** MISMATCH ***'
  END                                                         AS status,
  le.first_day AS legacy_first, m.first_day AS migrated_first,
  le.last_day  AS legacy_last,  m.last_day  AS migrated_last
FROM legacy le
FULL OUTER JOIN migrated m ON m.name = le.name
ORDER BY
  CASE WHEN COALESCE(le.rows, 0) = 0 AND COALESCE(m.rows, 0) = 0 THEN 1 ELSE 0 END,
  supplement;
