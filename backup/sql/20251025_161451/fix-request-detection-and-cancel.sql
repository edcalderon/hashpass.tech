-- Comprehensive fix for request detection and cancellation issues
-- This script addresses type casting, RLS policies, and function overloading

-- 1. Drop all existing versions of the problematic functions
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(text, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(uuid, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(uuid, text);

-- 2. Create a robust can_make_meeting_request function with proper type handling
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id TEXT,
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
    -- Check if user has an active pass (handle both UUID and TEXT user_id columns)
    BEGIN
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id::text = p_user_id::text 
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    EXCEPTION WHEN OTHERS THEN
        -- If there's a type error, try alternative approach
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id = p_user_id::uuid 
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    END;

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

    -- Check if user is blocked by speaker
    SELECT * INTO user_blocked
    FROM public.user_blocks ub
    WHERE ub.speaker_id = p_speaker_id 
      AND ub.blocked_user_id::text = p_user_id::text;

    IF user_blocked IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You are blocked by this speaker' as reason,
            user_pass.pass_type::pass_type as pass_type,
            (user_pass.max_meeting_requests - user_pass.used_meeting_requests) as remaining_requests,
            (user_pass.max_boost_amount - user_pass.used_boost_amount) as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending or approved request to this speaker
    -- Handle both UUID and TEXT requester_id columns
    BEGIN
        SELECT * INTO existing_request
        FROM public.meeting_requests mr
        WHERE mr.requester_id::text = p_user_id::text 
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved');
    EXCEPTION WHEN OTHERS THEN
        -- If there's a type error, try alternative approach
        SELECT * INTO existing_request
        FROM public.meeting_requests mr
        WHERE mr.requester_id = p_user_id::uuid 
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved');
    END;

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

-- 3. Create a robust get_meeting_request_status function
CREATE OR REPLACE FUNCTION get_meeting_request_status(
    p_user_id TEXT,
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
    -- Handle both UUID and TEXT requester_id columns
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
        WHERE mr.requester_id::text = p_user_id::text 
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved', 'declined')
        ORDER BY mr.created_at DESC
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        -- If there's a type error, try alternative approach
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
        WHERE mr.requester_id = p_user_id::uuid 
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved', 'declined')
        ORDER BY mr.created_at DESC
        LIMIT 1;
    END;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a robust cancel_meeting_request function
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_user_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    -- Handle both UUID and TEXT requester_id columns
    BEGIN
        UPDATE public.meeting_requests 
        SET 
            status = 'cancelled',
            updated_at = NOW()
        WHERE id = p_request_id::uuid 
          AND requester_id::text = p_user_id::text
          AND status = 'pending';
        
        GET DIAGNOSTICS updated_rows = ROW_COUNT;
    EXCEPTION WHEN OTHERS THEN
        -- If there's a type error, try alternative approach
        UPDATE public.meeting_requests 
        SET 
            status = 'cancelled',
            updated_at = NOW()
        WHERE id = p_request_id::uuid 
          AND requester_id = p_user_id::uuid
          AND status = 'pending';
        
        GET DIAGNOSTICS updated_rows = ROW_COUNT;
    END;
    
    RETURN updated_rows > 0;
END;
$$ LANGUAGE plpgsql;

-- 5. Ensure RLS policies allow users to update their own requests
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can update their own meeting requests" ON meeting_requests;
DROP POLICY IF EXISTS "Users can cancel their own meeting requests" ON meeting_requests;

-- Create comprehensive RLS policies
CREATE POLICY "Users can update their own meeting requests" ON meeting_requests
    FOR UPDATE USING (
        auth.uid()::text = requester_id::text OR 
        auth.uid() = requester_id
    );

CREATE POLICY "Users can cancel their own meeting requests" ON meeting_requests
    FOR UPDATE USING (
        auth.uid()::text = requester_id::text OR 
        auth.uid() = requester_id
    );

-- 6. Grant necessary permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(TEXT, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_request_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_meeting_request(TEXT, TEXT) TO authenticated;

-- 7. Test the functions (optional - remove in production)
-- SELECT 'Functions created successfully' as status;
