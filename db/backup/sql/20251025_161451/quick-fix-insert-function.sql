-- Quick fix for insert_meeting_request function
-- This bypasses the trigger issue by handling the can_make_meeting_request call internally

-- Drop the existing function
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);

-- Create a version that doesn't rely on triggers
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
    -- First, check if user can make a meeting request (internal check)
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
    
    -- Check if user has remaining requests
    IF total_requests <= 0 THEN
        result := json_build_object(
            'success', false,
            'error', 'No remaining meeting requests',
            'message', 'You have no remaining meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > total_boost THEN
        result := json_build_object(
            'success', false,
            'error', 'Insufficient boost amount',
            'message', 'You do not have enough boost amount'
        );
        RETURN result;
    END IF;
    
    -- Generate a new UUID for the request
    new_request_id := gen_random_uuid();
    
    -- Insert the meeting request with correct column names and proper type handling
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
        note,
        boost_amount,
        duration_minutes,
        expires_at,
        status,
        created_at,
        updated_at
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO anon;
