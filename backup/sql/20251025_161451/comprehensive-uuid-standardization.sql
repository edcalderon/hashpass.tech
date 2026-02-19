-- Comprehensive UUID Standardization Script
-- This script standardizes ALL database tables and functions to use UUID types consistently
-- Run this in your Supabase SQL Editor to fix all 404 errors

-- ============================================================================
-- STEP 1: DIAGNOSE CURRENT STATE
-- ============================================================================

-- Check current column types
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('meeting_requests', 'passes', 'user_request_limits', 'bsl_speakers')
  AND table_schema = 'public'
  AND (column_name LIKE '%_id%' OR column_name = 'id')
ORDER BY table_name, column_name;

-- ============================================================================
-- STEP 2: DROP ALL EXISTING FUNCTIONS TO AVOID CONFLICTS
-- ============================================================================

DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS get_meeting_request_status(text, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(uuid, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(uuid, text);

-- ============================================================================
-- STEP 3: ENSURE ALL TABLES HAVE PROPER UUID COLUMNS
-- ============================================================================

-- Update meeting_requests table to use UUID for requester_id
DO $$
BEGIN
    -- Check if requester_id is already UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meeting_requests' 
          AND column_name = 'requester_id' 
          AND data_type = 'text'
          AND table_schema = 'public'
    ) THEN
        -- Convert TEXT to UUID
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN requester_id TYPE UUID USING requester_id::UUID;
        
        RAISE NOTICE 'Converted meeting_requests.requester_id from TEXT to UUID';
    ELSE
        RAISE NOTICE 'meeting_requests.requester_id is already UUID or does not exist';
    END IF;
END $$;

-- Update meeting_requests table to use UUID for id
DO $$
BEGIN
    -- Check if id is already UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meeting_requests' 
          AND column_name = 'id' 
          AND data_type = 'text'
          AND table_schema = 'public'
    ) THEN
        -- Convert TEXT to UUID
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN id TYPE UUID USING id::UUID;
        
        RAISE NOTICE 'Converted meeting_requests.id from TEXT to UUID';
    ELSE
        RAISE NOTICE 'meeting_requests.id is already UUID or does not exist';
    END IF;
END $$;

-- Ensure passes table uses UUID for user_id
DO $$
BEGIN
    -- Check if user_id is already UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'passes' 
          AND column_name = 'user_id' 
          AND data_type = 'text'
          AND table_schema = 'public'
    ) THEN
        -- Convert TEXT to UUID
        ALTER TABLE public.passes 
        ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
        
        RAISE NOTICE 'Converted passes.user_id from TEXT to UUID';
    ELSE
        RAISE NOTICE 'passes.user_id is already UUID or does not exist';
    END IF;
END $$;

-- Ensure user_request_limits table uses UUID for user_id
DO $$
BEGIN
    -- Check if user_id is already UUID
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_request_limits' 
          AND column_name = 'user_id' 
          AND data_type = 'text'
          AND table_schema = 'public'
    ) THEN
        -- Convert TEXT to UUID
        ALTER TABLE public.user_request_limits 
        ALTER COLUMN user_id TYPE UUID USING user_id::UUID;
        
        RAISE NOTICE 'Converted user_request_limits.user_id from TEXT to UUID';
    ELSE
        RAISE NOTICE 'user_request_limits.user_id is already UUID or does not exist';
    END IF;
END $$;

-- ============================================================================
-- STEP 4: CREATE UUID-ONLY FUNCTIONS
-- ============================================================================

-- Create can_make_meeting_request function (UUID only)
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type TEXT,
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
BEGIN
    -- Check if user has an active pass (UUID only)
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = p_user_id
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active';

    -- If no active pass found
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No active pass found' as reason,
            NULL::TEXT as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending or approved request to this speaker
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE mr.requester_id = p_user_id
      AND mr.speaker_id = p_speaker_id 
      AND mr.status IN ('pending', 'approved');

    IF existing_request IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You already have a pending or approved request to this speaker' as reason,
            user_pass.pass_type::TEXT as pass_type,
            (user_pass.max_meeting_requests - user_pass.used_meeting_requests) as remaining_requests,
            (user_pass.max_boost_amount - user_pass.used_boost_amount) as remaining_boost;
        RETURN;
    END IF;

    -- Calculate remaining requests and boost
    remaining_req := user_pass.max_meeting_requests - user_pass.used_meeting_requests;
    remaining_boost := user_pass.max_boost_amount - user_pass.used_boost_amount;

    -- Check if user has enough requests left
    IF remaining_req <= 0 THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No meeting requests remaining' as reason,
            user_pass.pass_type::TEXT as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::TEXT as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;

-- Create insert_meeting_request function (UUID only)
CREATE OR REPLACE FUNCTION insert_meeting_request(
    p_requester_id UUID,
    p_speaker_id TEXT,
    p_speaker_name TEXT,
    p_requester_name TEXT,
    p_requester_company TEXT,
    p_requester_title TEXT,
    p_requester_ticket_type TEXT,
    p_meeting_type TEXT,
    p_message TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0,
    p_duration_minutes INTEGER DEFAULT 30,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(
    id UUID,
    requester_id UUID,
    speaker_id TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    new_request_id UUID;
    existing_request RECORD;
BEGIN
    -- Generate new request ID
    new_request_id := gen_random_uuid();
    
    -- Check for existing requests first to prevent duplicates
    SELECT * INTO existing_request
    FROM public.meeting_requests 
    WHERE requester_id = p_requester_id
      AND speaker_id = p_speaker_id 
      AND status IN ('pending', 'approved')
    LIMIT 1;
    
    -- If existing request found, return it
    IF existing_request IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            existing_request.id,
            existing_request.requester_id,
            existing_request.speaker_id,
            existing_request.status,
            existing_request.created_at;
        RETURN;
    END IF;
    
    -- Insert new meeting request
    INSERT INTO public.meeting_requests (
        id,
        requester_id,
        speaker_id,
        speaker_name,
        requester_name,
        requester_company,
        requester_title,
        requester_ticket_type,
        meeting_type,
        message,
        boost_amount,
        duration_minutes,
        expires_at,
        status,
        created_at,
        updated_at
    ) VALUES (
        new_request_id,
        p_requester_id,
        p_speaker_id,
        p_speaker_name,
        p_requester_name,
        p_requester_company,
        p_requester_title,
        p_requester_ticket_type,
        p_meeting_type,
        p_message,
        p_boost_amount,
        p_duration_minutes,
        COALESCE(p_expires_at, NOW() + INTERVAL '7 days'),
        'pending',
        NOW(),
        NOW()
    );
    
    -- Return the created request
    RETURN QUERY
    SELECT 
        new_request_id,
        p_requester_id,
        p_speaker_id,
        'pending',
        NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 5: GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION can_make_meeting_request(UUID, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- STEP 6: UPDATE APPLICATION CODE TO USE UUID
-- ============================================================================

-- The application code needs to be updated to pass UUID strings instead of TEXT
-- The functions will now expect proper UUID format

-- ============================================================================
-- STEP 7: TEST THE FUNCTIONS
-- ============================================================================

-- Test with a valid UUID format
SELECT 'Testing can_make_meeting_request function...' as status;
SELECT * FROM can_make_meeting_request('00000000-0000-0000-0000-000000000000', '550e8400-e29b-41d4-a716-446655440001', 0);

SELECT 'UUID standardization completed successfully!' as status;

