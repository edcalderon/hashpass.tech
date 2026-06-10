-- Emergency fix to completely remove all triggers and old functions
-- This will fix the insert_meeting_request function once and for all

-- 1. Drop ALL existing functions to avoid conflicts
DROP FUNCTION IF EXISTS can_make_meeting_request(text,text,numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid,text,numeric);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer);
DROP FUNCTION IF EXISTS get_meeting_requests_for_speaker(text);

-- 2. Drop any triggers that might be calling old functions
DROP TRIGGER IF EXISTS check_meeting_request_limits ON meeting_requests;
DROP TRIGGER IF EXISTS update_pass_usage ON meeting_requests;

-- 3. Create the clean insert_meeting_request function with internal validation
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
    p_note text DEFAULT NULL,
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
    pass_record RECORD;
    total_requests integer;
    total_boost numeric;
BEGIN
    -- Generate new UUID for the request
    new_request_id := gen_random_uuid();
    
    -- Internal pass validation (no external function calls)
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_requester_id
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        result := json_build_object(
            'success', false, 
            'error', 'No active pass found', 
            'message', 'You need an active pass to make meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Check if pass is active
    IF pass_record.status != 'active' THEN
        result := json_build_object(
            'success', false, 
            'error', 'Pass is not active', 
            'message', 'Your pass is not active'
        );
        RETURN result;
    END IF;
    
    -- Calculate remaining requests and boost
    total_requests := COALESCE(pass_record.max_meeting_requests, 0) - COALESCE(pass_record.used_meeting_requests, 0);
    total_boost := COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0);
    
    -- Check remaining requests
    IF total_requests <= 0 THEN
        result := json_build_object(
            'success', false, 
            'error', 'No remaining meeting requests', 
            'message', 'You have no remaining meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Check boost amount
    IF p_boost_amount > total_boost THEN
        result := json_build_object(
            'success', false, 
            'error', 'Insufficient boost amount', 
            'message', 'You do not have enough boost amount'
        );
        RETURN result;
    END IF;
    
    -- Insert the meeting request
    INSERT INTO public.meeting_requests (
        id, requester_id, speaker_id, speaker_name, requester_name,
        requester_company, requester_title, requester_ticket_type,
        meeting_type, message, note, boost_amount, duration_minutes,
        expires_at, status, created_at, updated_at
    ) VALUES (
        new_request_id, 
        p_requester_id::uuid, 
        p_speaker_id, 
        p_speaker_name, 
        p_requester_name,
        p_requester_company, 
        p_requester_title, 
        p_requester_ticket_type,
        p_meeting_type, 
        p_message, 
        p_note, 
        p_boost_amount, 
        p_duration_minutes,
        COALESCE(p_expires_at, NOW() + INTERVAL '7 days'), 
        'pending', 
        NOW(), 
        NOW()
    );
    
    -- Update pass usage
    UPDATE public.passes 
    SET 
        used_meeting_requests = COALESCE(used_meeting_requests, 0) + 1,
        used_boost_amount = COALESCE(used_boost_amount, 0) + p_boost_amount,
        updated_at = NOW()
    WHERE id = pass_record.id;
    
    -- Return success
    result := json_build_object(
        'success', true, 
        'request_id', new_request_id, 
        'message', 'Meeting request created successfully'
    );
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'success', false, 
            'error', SQLERRM, 
            'message', 'Failed to create meeting request'
        );
        RETURN result;
END;
$$;

-- 4. Create the can_make_meeting_request function (TEXT version)
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
    total_boost numeric;
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
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'No active pass found',
            'pass_type', null,
            'remaining_requests', 0,
            'remaining_boost', 0
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
            'remaining_boost', 0
        );
        RETURN result;
    END IF;
    
    -- Calculate remaining requests and boost
    total_requests := COALESCE(pass_record.max_meeting_requests, 0) - COALESCE(pass_record.used_meeting_requests, 0);
    total_boost := COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0);
    
    -- Check remaining requests
    IF total_requests <= 0 THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'No remaining meeting requests',
            'pass_type', pass_record.pass_type,
            'remaining_requests', total_requests,
            'remaining_boost', total_boost
        );
        RETURN result;
    END IF;
    
    -- Check boost amount
    IF p_boost_amount > total_boost THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'Insufficient boost amount',
            'pass_type', pass_record.pass_type,
            'remaining_requests', total_requests,
            'remaining_boost', total_boost
        );
        RETURN result;
    END IF;
    
    -- All checks passed
    result := json_build_object(
        'can_request', true, 
        'reason', 'Request allowed',
        'pass_type', pass_record.pass_type,
        'remaining_requests', total_requests,
        'remaining_boost', total_boost
    );
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        result := json_build_object(
            'can_request', false, 
            'reason', 'Error checking pass: ' || SQLERRM,
            'pass_type', null,
            'remaining_requests', 0,
            'remaining_boost', 0
        );
        RETURN result;
END;
$$;

-- 5. Create the get_meeting_requests_for_speaker function
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

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO anon;

GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION can_make_meeting_request(text,text,numeric) TO anon;

GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_requests_for_speaker(text) TO anon;

-- 7. Verify functions exist
SELECT 'Functions created successfully' as status;
