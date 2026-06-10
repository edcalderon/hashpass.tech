-- Complete fix for all meeting request issues
-- This script addresses:
-- 1. Function overloading conflicts
-- 2. Column name mismatches
-- 3. Type casting issues
-- 4. Missing UUID functions for triggers

-- Step 1: Drop ALL existing versions of insert_meeting_request
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);

-- Step 2: Create UUID version of can_make_meeting_request for table triggers
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id uuid,
    p_speaker_id text,
    p_boost_amount numeric
)
RETURNS TABLE(
    can_request boolean,
    reason text,
    pass_type text,
    remaining_requests integer,
    remaining_boost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_uuid uuid;
    pass_record RECORD;
    total_requests integer;
    total_boost numeric;
BEGIN
    -- Convert user_id to UUID if needed
    user_uuid := p_user_id;
    
    -- Get user's pass information using text comparison to handle mixed types
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = user_uuid::text 
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'No active pass found', 'none'::text, 0, 0::numeric;
        RETURN;
    END IF;
    
    -- Check if pass is active
    IF pass_record.status != 'active' THEN
        RETURN QUERY SELECT false, 'Pass is not active', pass_record.pass_type, 0, 0::numeric;
        RETURN;
    END IF;
    
    -- Calculate remaining requests and boost
    total_requests := COALESCE(pass_record.max_meeting_requests, 0) - COALESCE(pass_record.used_meeting_requests, 0);
    total_boost := COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0);
    
    -- Check if user has remaining requests
    IF total_requests <= 0 THEN
        RETURN QUERY SELECT false, 'No remaining meeting requests', pass_record.pass_type, total_requests, total_boost;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > total_boost THEN
        RETURN QUERY SELECT false, 'Insufficient boost amount', pass_record.pass_type, total_requests, total_boost;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, 'Request allowed', pass_record.pass_type, total_requests, total_boost;
END;
$$;

-- Step 3: Create the single, correct insert_meeting_request function
CREATE OR REPLACE FUNCTION insert_meeting_request(
    p_requester_id text,
    p_speaker_id text,
    p_speaker_name text,
    p_requester_name text,
    p_requester_company text,
    p_requester_title text,
    p_requester_ticket_type text,
    p_meeting_type text,
    p_message text,
    p_boost_amount numeric,
    p_duration_minutes integer,
    p_expires_at timestamp with time zone DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_request_id uuid;
    result json;
BEGIN
    -- Generate a new UUID for the request
    new_request_id := gen_random_uuid();
    
    -- Insert the meeting request with correct column names
    INSERT INTO public.meeting_requests (
        id,
        requester_id,
        speaker_id,
        speaker_name,
        requester_name,
        requester_company,  -- Correct column name (not p_requester_company)
        requester_title,    -- Correct column name (not p_requester_title)
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
        p_requester_id::uuid,  -- Convert text to UUID
        p_speaker_id::uuid,    -- Convert text to UUID
        p_speaker_name,
        p_requester_name,
        p_requester_company,   -- Correct column name
        p_requester_title,     -- Correct column name
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
    
    -- Return success response
    result := json_build_object(
        'success', true,
        'request_id', new_request_id,
        'message', 'Meeting request created successfully'
    );
    
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Return error response
        result := json_build_object(
            'success', false,
            'error', SQLERRM,
            'message', 'Failed to create meeting request'
        );
        
        RETURN result;
END;
$$;

-- Step 4: Create function to get meeting requests for a speaker
CREATE OR REPLACE FUNCTION get_meeting_requests_for_speaker(
    p_user_id text,
    p_speaker_id text
)
RETURNS TABLE(
    id uuid,
    requester_id uuid,
    speaker_id text,  -- Changed from uuid to text to match actual column type
    speaker_name text,
    requester_name text,
    requester_company text,
    requester_title text,
    requester_ticket_type text,
    meeting_type text,
    message text,
    boost_amount numeric,
    duration_minutes integer,
    status text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    expires_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id,
        mr.requester_id,
        mr.speaker_id::text,  -- Explicitly cast to text
        mr.speaker_name,
        mr.requester_name,
        mr.requester_company,
        mr.requester_title,
        mr.requester_ticket_type,
        mr.meeting_type,
        mr.message,
        mr.boost_amount,
        mr.duration_minutes,
        mr.status,
        mr.created_at,
        mr.updated_at,
        mr.expires_at
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.speaker_id::text = p_speaker_id
      AND mr.status != 'cancelled'
    ORDER BY mr.created_at DESC;
END;
$$;

-- Step 5: Grant permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO anon;

-- Step 6: Create a simple test function to verify everything works
CREATE OR REPLACE FUNCTION test_meeting_request_system()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
    test_user_id text := '13e93d3b-0556-4f0d-a065-1f013019618b';
    test_speaker_id text := '550e8400-e29b-41d4-a716-446655440001';
    can_request_result RECORD;
    insert_result json;
BEGIN
    -- Test can_make_meeting_request
    SELECT * INTO can_request_result
    FROM can_make_meeting_request(test_user_id::uuid, test_speaker_id, 0);
    
    -- Test insert_meeting_request
    SELECT insert_meeting_request(
        test_user_id,
        test_speaker_id,
        'Test Speaker',
        'Test User',
        'Test Company',
        'Test Title',
        'business',
        'networking',
        'Test message',
        0,
        15
    ) INTO insert_result;
    
    result := json_build_object(
        'can_request_test', can_request_result,
        'insert_test', insert_result,
        'status', 'All tests completed'
    );
    
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION test_meeting_request_system() TO authenticated;
GRANT EXECUTE ON FUNCTION test_meeting_request_system() TO anon;
