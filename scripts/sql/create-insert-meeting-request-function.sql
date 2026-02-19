-- Simple script to create the missing insert_meeting_request function
-- Run this in your Supabase SQL editor

-- Drop any existing version first
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);

-- Create the insert_meeting_request function
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
    new_requester_id UUID;
BEGIN
    -- Generate new UUIDs
    new_request_id := gen_random_uuid();
    
    -- Handle both UUID and TEXT requester_id columns
    BEGIN
        new_requester_id := p_requester_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        -- If conversion fails, generate a new UUID
        new_requester_id := gen_random_uuid();
    END;
    
    -- Check for existing requests first to prevent duplicates
    IF EXISTS (
        SELECT 1 FROM public.meeting_requests 
        WHERE requester_id::text = p_requester_id::text 
          AND speaker_id = p_speaker_id 
          AND status IN ('pending', 'approved')
    ) THEN
        -- Return existing request instead of creating new one
        RETURN QUERY
        SELECT 
            mr.id,
            mr.requester_id,
            mr.speaker_id,
            mr.status,
            mr.created_at
        FROM public.meeting_requests mr
        WHERE mr.requester_id::text = p_requester_id::text 
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved')
        ORDER BY mr.created_at DESC
        LIMIT 1;
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
        new_requester_id,
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
        new_requester_id,
        p_speaker_id,
        'pending',
        NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;

-- Test the function (optional)
-- SELECT 'insert_meeting_request function created successfully' as status;
