-- Exact row count for every table in schema public, as "table|count" lines.
-- Used by the nightly backup (against the source) and the restore drill (against
-- the restored copy). Run with: psql -At -f row-counts.sql
select tablename || '|' || (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from public.%I', tablename), false, true, '')))[1]::text
from pg_tables
where schemaname = 'public'
order by tablename;
