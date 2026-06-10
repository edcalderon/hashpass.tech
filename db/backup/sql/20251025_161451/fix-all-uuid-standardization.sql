-- Comprehensive UUID standardization fix
-- This script standardizes all user IDs to UUID type to eliminate type casting issues

-- 1. First, let's check current column types
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name IN ('meeting_requests', 'passes', 'user_blocks')
AND table_schema = 'public'
AND column_name LIKE '%user_id%' OR column_name LIKE '%requester_id%' OR column_name LIKE '%blocked_user_id%'
ORDER BY table_name, column_name;

-- 2. Drop all existing problematic functions
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(text, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(uuid, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(uuid, text);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);

-- 3. Create UUID-only can_make_meeting_request function
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type pass_type,
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    user_blocked RECORD;
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
            NULL::pass_type as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END IF;

    -- Check if user is blocked by speaker (UUID only)
    SELECT * INTO user_blocked
    FROM public.user_blocks ub
    WHERE ub.speaker_id = p_speaker_id 
      AND ub.blocked_user_id = p_user_id;

    IF user_blocked IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You are blocked by this speaker' as reason,
            user_pass.pass_type::pass_type as pass_type,
            (user_pass.max_meeting_requests - user_pass.used_meeting_requests) as remaining_requests,
            (user_pass.max_boost_amount - user_pass.used_boost_amount) as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending or approved request to this speaker (UUID only)
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE mr.requester_id = p_user_id
      AND mr.speaker_id = p_speaker_id 
      AND mr.status IN ('pending', 'approved');

    IF existing_request IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You already have a pending or approved request to this speaker' as reason,
            user_pass.pass_type::pass_type as pass_type,
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
            user_pass.pass_type::pass_type as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- Check if user has enough boost for the requested amount
    IF p_boost_amount > 0 AND remaining_boost < p_boost_amount THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'Insufficient VOI boost remaining' as reason,
            user_pass.pass_type::pass_type as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::pass_type as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;

-- 4. Create UUID-only get_meeting_request_status function
CREATE OR REPLACE FUNCTION get_meeting_request_status(
    p_user_id UUID,
    p_speaker_id TEXT
) RETURNS TABLE(
    id UUID,
    requester_id UUID,
    speaker_id TEXT,
    status TEXT,
    message TEXT,
    boost_amount DECIMAL(10,2),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mr.id,
        mr.requester_id,
        mr.speaker_id,
        mr.status,
        mr.message,
        mr.boost_amount,
        mr.created_at,
        mr.updated_at
    FROM public.meeting_requests mr
    WHERE mr.requester_id = p_user_id
      AND mr.speaker_id = p_speaker_id 
      AND mr.status IN ('pending', 'approved', 'declined')
    ORDER BY mr.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 5. Create UUID-only cancel_meeting_request function
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_user_id UUID,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.meeting_requests 
    SET 
        status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_request_id::uuid 
      AND requester_id = p_user_id
      AND status = 'pending';
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql;

-- 6. Create UUID-only insert_meeting_request function
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
    
    -- Check for existing requests first to prevent duplicates (UUID only)
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
    
    -- Insert new meeting request (UUID only)
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

-- 7. Update RLS policies to use UUID only
DROP POLICY IF EXISTS "Users can update their own meeting requests" ON meeting_requests;
DROP POLICY IF EXISTS "Users can cancel their own meeting requests" ON meeting_requests;

CREATE POLICY "Users can update their own meeting requests" ON meeting_requests
    FOR UPDATE USING (auth.uid() = requester_id);

CREATE POLICY "Users can cancel their own meeting requests" ON meeting_requests
    FOR UPDATE USING (auth.uid() = requester_id);

-- 8. Grant permissions for UUID functions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(UUID, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_request_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_meeting_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;

-- 9. Test the functions
SELECT 'All functions created successfully with UUID standardization' as status;
