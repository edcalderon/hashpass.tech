-- Diagnostic script to check database column types
-- Run this first to understand the actual column types

-- 1. Check meeting_requests table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'meeting_requests' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Check passes table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'passes' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check if functions exist
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_name IN ('insert_meeting_request', 'can_make_meeting_request', 'get_meeting_request_status')
AND routine_schema = 'public';

-- 4. Check RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename = 'meeting_requests';

-- 5. Sample data from meeting_requests (if any exists)
SELECT 
    id,
    requester_id,
    speaker_id,
    status,
    created_at
FROM meeting_requests 
LIMIT 5;
