-- Debug script to check current database state and functions
-- Run this in Supabase SQL editor to diagnose the issues

-- 1. Check if can_make_meeting_request function exists and its signature
SELECT 
    routine_name,
    routine_type,
    data_type,
    routine_definition
FROM information_schema.routines 
WHERE routine_name = 'can_make_meeting_request'
AND routine_schema = 'public';

-- 2. Check meeting_requests table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'meeting_requests' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 3. Check passes table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'passes' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 4. Check for existing meeting requests for a test user
-- Replace 'your-user-id' with actual user ID
SELECT 
    id,
    requester_id,
    speaker_id,
    status,
    created_at,
    updated_at
FROM meeting_requests 
WHERE requester_id = 'your-user-id'
ORDER BY created_at DESC;

-- 5. Test the can_make_meeting_request function
-- Replace with actual user and speaker IDs
SELECT * FROM can_make_meeting_request(
    'your-user-id'::text,
    'your-speaker-id'::text,
    0
);

-- 6. Check RLS policies on meeting_requests table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'meeting_requests';
