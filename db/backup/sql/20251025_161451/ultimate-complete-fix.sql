-- ULTIMATE COMPLETE FIX for all meeting request issues
-- This script will fix ALL problems in one go

-- Step 1: Drop ALL existing functions to eliminate conflicts
DROP FUNCTION IF EXISTS can_make_meeting_request(text,text,numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid,text,numeric);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);
DROP FUNCTION IF EXISTS get_meeting_requests_for_speaker(text,text);

-- Step 2: Create the single, correct can_make_meeting_request function (TEXT version)
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id text,
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
    pass_record RECORD;
    total_requests integer;
    total_boost numeric;
BEGIN
    -- Get user's pass information using text comparison to handle mixed types
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_user_id  -- Use text comparison
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

-- Step 2b: Create UUID version of can_make_meeting_request for table triggers
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
    pass_record RECORD;
    total_requests integer;
    total_boost numeric;
BEGIN
    -- Get user's pass information using text comparison to handle mixed types
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_user_id::text  -- Convert UUID to text for comparison
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
    p_note text DEFAULT NULL,  -- p_note comes before boost_amount and duration_minutes
    p_boost_amount numeric DEFAULT 0,
    p_duration_minutes integer DEFAULT 15,
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
    
    -- Insert the meeting request with correct column names and proper type handling
    INSERT INTO public.meeting_requests (
        id,
        requester_id,
        speaker_id,
        speaker_name,
        requester_name,
        requester_company,  -- Correct column name
        requester_title,    -- Correct column name
        requester_ticket_type,
        meeting_type,
        message,
        note,               -- Added note field
        boost_amount,
        duration_minutes,
        expires_at,
        status,
        created_at,
        updated_at
    ) VALUES (
        new_request_id,
        p_requester_id::uuid,  -- Convert text to UUID
        p_speaker_id,          -- Keep as text since speaker_id is text in DB
        p_speaker_name,
        p_requester_name,
        p_requester_company,
        p_requester_title,
        p_requester_ticket_type,
        p_meeting_type,
        p_message,
        p_note,                -- Added note value
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
    speaker_id text,  -- text to match actual column type
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
GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(uuid,text,numeric) TO anon;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text,text) TO anon;
