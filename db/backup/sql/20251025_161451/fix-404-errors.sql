-- Fix 404 errors in Supabase by creating properly typed functions
-- This addresses the "operator does not exist: text = uuid" error

-- 1. Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);

-- 2. Create can_make_meeting_request function that handles both TEXT and UUID inputs
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id TEXT,  -- Changed to TEXT to handle both UUID strings and actual UUIDs
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type TEXT,  -- Changed to TEXT to avoid enum issues
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
    user_uuid UUID;
BEGIN
    -- Convert text to UUID if needed
    BEGIN
        user_uuid := p_user_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'Invalid user ID format' as reason,
            NULL::TEXT as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END;

    -- Check if user has an active pass
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = user_uuid
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
    WHERE mr.requester_id = user_uuid
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

-- 3. Create insert_meeting_request function that handles TEXT input
CREATE OR REPLACE FUNCTION insert_meeting_request(
    p_requester_id TEXT,  -- Changed to TEXT to handle UUID strings
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
    user_uuid UUID;
BEGIN
    -- Convert text to UUID if needed
    BEGIN
        user_uuid := p_requester_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid requester_id format: %', p_requester_id;
    END;

    -- Generate new request ID
    new_request_id := gen_random_uuid();
    
    -- Check for existing requests first to prevent duplicates
    SELECT * INTO existing_request
    FROM public.meeting_requests 
    WHERE requester_id = user_uuid
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
        user_uuid,
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

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(TEXT, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;

-- 5. Test the functions
SELECT 'Functions created successfully - testing...' as status;

-- Test can_make_meeting_request function
SELECT * FROM can_make_meeting_request('00000000-0000-0000-0000-000000000000', 'test-speaker', 0);
