-- Verify create_default_pass overloads, trigger and policies

-- functions
SELECT 'functions' AS section;
SELECT n.nspname AS schema, p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'create_default_pass'
ORDER BY schema, proname, args;

-- trigger on auth.users
SELECT 'trigger' AS section;
SELECT tg.tgname, ns.nspname AS schema, c.relname AS table_name
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace ns ON ns.oid = c.relnamespace
WHERE c.relname = 'users' AND ns.nspname = 'auth' AND tg.tgname = 'on_auth_user_created';

-- rls policies allowing system inserts
SELECT 'policies' AS section;
SELECT schemaname, tablename, policyname, permissive
FROM pg_policies 
WHERE (tablename = 'passes' OR tablename = 'pass_request_limits')
ORDER BY schemaname, tablename, policyname;
