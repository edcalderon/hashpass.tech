-- Diagnostic script to check actual database schema
-- Run this to see what types your columns actually are

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
WHERE routine_name IN ('can_make_meeting_request', 'insert_meeting_request')
  AND routine_schema = 'public';

-- 4. Check a sample record from passes table
SELECT 
    id,
    user_id,
    pg_typeof(user_id) as user_id_type,
    event_id,
    pass_type,
    status
FROM public.passes 
LIMIT 1;

-- 5. Check a sample record from meeting_requests table
SELECT 
    id,
    pg_typeof(id) as id_type,
    requester_id,
    pg_typeof(requester_id) as requester_id_type,
    speaker_id,
    pg_typeof(speaker_id) as speaker_id_type,
    status
FROM public.meeting_requests 
LIMIT 1;
