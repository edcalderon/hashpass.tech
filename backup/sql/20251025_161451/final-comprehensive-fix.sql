-- FINAL COMPREHENSIVE FIX: Allow multiple meeting requests and fix function conflicts
-- This script creates a system that allows multiple meeting requests to the same speaker

-- 1. Drop ALL existing functions to avoid conflicts
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer);

-- 2. Create can_make_meeting_request function (allows multiple requests to same speaker)
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id TEXT,
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
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
BEGIN
    -- Check if user has an active pass - use ONLY text comparison
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id::text = p_user_id::text  -- Force text comparison
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active'
    LIMIT 1;

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

    -- Calculate remaining requests and boost
    remaining_req := user_pass.max_meeting_requests - user_pass.used_meeting_requests;
    remaining_boost := user_pass.max_boost_amount - user_pass.used_boost_amount;

    -- Check if user has enough requests left (removed duplicate request check)
    IF remaining_req <= 0 THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No meeting requests remaining' as reason,
            user_pass.pass_type::TEXT as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request (multiple requests allowed)
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::TEXT as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;

-- 3. Create insert_meeting_request function (allows multiple requests)
CREATE OR REPLACE FUNCTION insert_meeting_request(
    p_requester_id TEXT,
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
    user_uuid UUID;
BEGIN
    -- Convert TEXT to UUID for return value
    BEGIN
        user_uuid := p_requester_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid requester_id format: %', p_requester_id;
    END;

    -- Generate new request ID
    new_request_id := gen_random_uuid();
    
    -- Insert new meeting request (no duplicate check - allow multiple requests)
    INSERT INTO public.meeting_requests (
        id,
        requester_id,
        speaker_id,
        speaker_name,
        requester_name,
        p_requester_company,
        p_requester_title,
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
        p_requester_id,  -- Let PostgreSQL handle the conversion
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
        user_uuid,
        p_speaker_id,
        'pending',
        NOW();
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to get all meeting requests for a user and speaker
CREATE OR REPLACE FUNCTION get_meeting_requests_for_speaker(
    p_user_id TEXT,
    p_speaker_id TEXT
) RETURNS TABLE(
    id UUID,
    requester_id UUID,
    speaker_id TEXT,
    speaker_name TEXT,
    requester_name TEXT,
    requester_company TEXT,
    requester_title TEXT,
    requester_ticket_type TEXT,
    meeting_type TEXT,
    message TEXT,
    boost_amount DECIMAL(10,2),
    duration_minutes INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Convert TEXT to UUID
    BEGIN
        user_uuid := p_user_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid user_id format: %', p_user_id;
    END;

    -- Return all meeting requests for this user and speaker
    RETURN QUERY
    SELECT 
        mr.id,
        mr.requester_id,
        mr.speaker_id,
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
    WHERE mr.requester_id::text = p_user_id::text  -- Force text comparison
      AND mr.speaker_id = p_speaker_id
    ORDER BY mr.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Grant permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(TEXT, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(TEXT, TEXT) TO authenticated;

-- 6. Test the functions
SELECT 'Comprehensive fix applied - testing functions...' as status;

-- Test can_make_meeting_request function
SELECT * FROM can_make_meeting_request('13e93d3b-0556-4f0d-a065-1f013019618b', '550e8400-e29b-41d4-a716-446655440001', 0);

-- Test insert_meeting_request function
SELECT * FROM insert_meeting_request(
    '13e93d3b-0556-4f0d-a065-1f013019618b',
    '550e8400-e29b-41d4-a716-446655440001',
    'Claudia Restrepo',
    'Edward Calderon',
    'HashPass',
    'CEO',
    'business',
    'networking',
    'Test meeting request 1',
    0,
    15,
    NULL
);

-- Test getting meeting requests for speaker
SELECT * FROM get_meeting_requests_for_speaker('13e93d3b-0556-4f0d-a065-1f013019618b', '550e8400-e29b-41d4-a716-446655440001');

SELECT 'Comprehensive fix completed successfully!' as status;
