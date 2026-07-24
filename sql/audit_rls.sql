-- READ-ONLY RLS AUDIT. Changes nothing. Run this FIRST.
--
-- Section 1 shows which tables currently have Row Level Security on/off.
-- Section 2 shows rows whose user_id is NULL — important, because those rows
-- become INVISIBLE to the app once RLS is enabled (they are not deleted, but
-- they belong to nobody, so no per-user policy can match them). If section 2
-- returns anything, fix ownership before running enable_rls_legacy_tables.sql.

-- 1) RLS status + policy count for every table the app uses
SELECT
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
  EXISTS (
    SELECT 1 FROM information_schema.columns col
     WHERE col.table_schema = 'public'
       AND col.table_name  = c.relname
       AND col.column_name = 'user_id'
  )                                           AS has_user_id
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2) Orphaned rows (user_id IS NULL) that would become invisible under RLS.
--    Empty result = safe to proceed.
DO $$
DECLARE
  t text;
  n bigint;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public'
            AND col.table_name  = c.relname
            AND col.column_name = 'user_id'
       )
     ORDER BY c.relname
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id IS NULL', t) INTO n;
    IF n > 0 THEN
      RAISE NOTICE 'ORPHANED ROWS: %  ->  % row(s) with user_id IS NULL', t, n;
    END IF;
  END LOOP;
  RAISE NOTICE 'Audit complete. No further ORPHANED lines above = safe to proceed.';
END $$;
