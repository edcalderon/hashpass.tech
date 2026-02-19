-- Fix column names in insert_meeting_request function
-- The function was using p_requester_company instead of requester_company

-- Drop the existing function
DROP FUNCTION IF EXISTS insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone);

-- Create the corrected function with proper column names
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
        requester_company,  -- Fixed: was p_requester_company
        requester_title,    -- Fixed: was p_requester_title
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
        p_requester_company,   -- Fixed: was p_requester_company
        p_requester_title,     -- Fixed: was p_requester_title
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(text,text,text,text,text,text,text,text,text,numeric,integer,timestamp with time zone) TO anon;
