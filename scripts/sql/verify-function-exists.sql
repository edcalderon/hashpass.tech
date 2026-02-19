-- SUPER SIMPLE: Just check what functions exist
SELECT 
    proname as function_name,
    pronargs as num_args,
    proargtypes::regtype[] as arg_types,
    prosrc as function_source
FROM pg_proc 
WHERE proname LIKE '%meeting_request%'
ORDER BY proname, pronargs;
