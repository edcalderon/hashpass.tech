-- Fix request counting system to show actual meeting requests from database
-- This will make the system count real meeting requests instead of relying on pass counters

-- 1. Create function to get real meeting request counts for a user
CREATE OR REPLACE FUNCTION get_user_meeting_request_counts(p_user_id text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pass_record RECORD;
    total_requests integer;
    pending_requests integer;
    approved_requests integer;
    declined_requests integer;
    cancelled_requests integer;
    result json;
BEGIN
    -- Get user's pass information
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_user_id
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Count actual meeting requests from database
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'accepted' OR status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'declined' THEN 1 END) as declined,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
    INTO total_requests, pending_requests, approved_requests, declined_requests, cancelled_requests
    FROM public.meeting_requests 
    WHERE requester_id::text = p_user_id;
    
    -- If no pass found, return default values
    IF NOT FOUND THEN
        result := json_build_object(
            'pass_type', null,
            'max_requests', 0,
            'total_requests', total_requests,
            'pending_requests', pending_requests,
            'approved_requests', approved_requests,
            'declined_requests', declined_requests,
            'cancelled_requests', cancelled_requests,
            'remaining_requests', 0,
            'max_boost', 0,
            'used_boost', 0,
            'remaining_boost', 0
        );
        RETURN result;
    END IF;
    
    -- Calculate remaining requests (max - total actual requests)
    DECLARE
        remaining_requests integer;
        remaining_boost numeric;
    BEGIN
        remaining_requests := GREATEST(0, COALESCE(pass_record.max_meeting_requests, 0) - total_requests);
        remaining_boost := GREATEST(0, COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0));
        
        result := json_build_object(
            'pass_type', pass_record.pass_type,
            'max_requests', pass_record.max_meeting_requests,
            'total_requests', total_requests,
            'pending_requests', pending_requests,
            'approved_requests', approved_requests,
            'declined_requests', declined_requests,
            'cancelled_requests', cancelled_requests,
            'remaining_requests', remaining_requests,
            'max_boost', pass_record.max_boost_amount,
            'used_boost', pass_record.used_boost_amount,
            'remaining_boost', remaining_boost
        );
        RETURN result;
    END;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'pass_type', null,
            'max_requests', 0,
            'total_requests', 0,
            'pending_requests', 0,
            'approved_requests', 0,
            'declined_requests', 0,
            'cancelled_requests', 0,
            'remaining_requests', 0,
            'max_boost', 0,
            'used_boost', 0,
            'remaining_boost', 0,
            'error', SQLERRM
        );
        RETURN result;
END;
$$;

-- 2. Create function to get meeting requests for a specific speaker
CREATE OR REPLACE FUNCTION get_meeting_requests_for_speaker(p_speaker_id text)
RETURNS TABLE(
    id uuid,
    requester_id uuid,
    speaker_id text,
    speaker_name text,
    requester_name text,
    requester_company text,
    requester_title text,
    requester_ticket_type text,
    meeting_type text,
    message text,
    note text,
    boost_amount numeric,
    duration_minutes integer,
    status text,
    priority_score numeric,
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
        mr.speaker_id::text,
        mr.speaker_name,
        mr.requester_name,
        mr.requester_company,
        mr.requester_title,
        mr.requester_ticket_type,
        mr.meeting_type,
        mr.message,
        mr.note,
        mr.boost_amount,
        mr.duration_minutes,
        mr.status,
        mr.priority_score,
        mr.created_at,
        mr.updated_at,
        mr.expires_at
    FROM public.meeting_requests mr
    WHERE mr.speaker_id = p_speaker_id
    ORDER BY mr.created_at DESC;
END;
$$;

-- 3. Update the can_make_meeting_request function to use real counts
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id text,
    p_speaker_id text,
    p_boost_amount numeric DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pass_record RECORD;
    total_requests integer;
    remaining_requests integer;
    remaining_boost numeric;
    result json;
BEGIN
    -- Get user's pass information
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_user_id
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Count actual meeting requests from database
    SELECT COUNT(*)
    INTO total_requests
    FROM public.meeting_requests 
    WHERE requester_id::text = p_user_id;
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'No active pass found',
            'pass_type', null,
            'remaining_requests', 0,
            'remaining_boost', 0,
            'total_requests', total_requests
        );
        RETURN result;
    END IF;
    
    -- Check if pass is active
    IF pass_record.status != 'active' THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'Pass is not active',
            'pass_type', pass_record.pass_type,
            'remaining_requests', 0,
            'remaining_boost', 0,
            'total_requests', total_requests
        );
        RETURN result;
    END IF;
    
    -- Calculate remaining requests and boost using real counts
    remaining_requests := GREATEST(0, COALESCE(pass_record.max_meeting_requests, 0) - total_requests);
    remaining_boost := GREATEST(0, COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0));
    
    -- Check remaining requests
    IF remaining_requests <= 0 THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'No remaining meeting requests',
            'pass_type', pass_record.pass_type,
            'remaining_requests', remaining_requests,
            'remaining_boost', remaining_boost,
            'total_requests', total_requests
        );
        RETURN result;
    END IF;
    
    -- Check boost amount
    IF p_boost_amount > remaining_boost THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'Insufficient boost amount',
            'pass_type', pass_record.pass_type,
            'remaining_requests', remaining_requests,
            'remaining_boost', remaining_boost,
            'total_requests', total_requests
        );
        RETURN result;
    END IF;
    
    -- All checks passed
    result := json_build_object(
        'can_request', true, 
        'reason', 'Request allowed',
        'pass_type', pass_record.pass_type,
        'remaining_requests', remaining_requests,
        'remaining_boost', remaining_boost,
        'total_requests', total_requests
    );
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'Error checking pass: ' || SQLERRM,
            'pass_type', null,
            'remaining_requests', 0,
            'remaining_boost', 0,
            'total_requests', 0
        );
        RETURN result;
END;
$$;

-- 4. Grant permissions
GRANT EXECUTE ON FUNCTION get_user_meeting_request_counts(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_meeting_request_counts(text) TO anon;

GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text) TO anon;

GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO anon;

-- 5. Verify functions exist
SELECT 'Request counting functions created successfully' as status;
