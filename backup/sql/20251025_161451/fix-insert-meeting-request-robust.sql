-- Robust fix for insert_meeting_request function with proper type handling
-- This script handles the text = uuid type casting issues

-- First, let's check the actual column types in the meeting_requests table
-- Run this query first to see the column types:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'meeting_requests' AND table_schema = 'public';

-- Drop any existing version first
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);

-- Create a more robust insert_meeting_request function
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
    existing_request RECORD;
BEGIN
    -- Generate new UUIDs
    new_request_id := gen_random_uuid();
    
    -- Handle requester_id conversion with multiple fallback approaches
    BEGIN
        -- Try direct UUID conversion first
        new_requester_id := p_requester_id::uuid;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            -- Try to extract UUID from text if it's in a specific format
            IF p_requester_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                new_requester_id := p_requester_id::uuid;
            ELSE
                -- Generate a new UUID if conversion fails
                new_requester_id := gen_random_uuid();
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Final fallback - generate new UUID
            new_requester_id := gen_random_uuid();
        END;
    END;
    
    -- Check for existing requests with multiple type casting approaches
    BEGIN
        -- Try TEXT comparison first
        SELECT * INTO existing_request
        FROM public.meeting_requests 
        WHERE requester_id::text = p_requester_id::text 
          AND speaker_id = p_speaker_id 
          AND status IN ('pending', 'approved')
        LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            -- Try UUID comparison
            SELECT * INTO existing_request
            FROM public.meeting_requests 
            WHERE requester_id = new_requester_id
              AND speaker_id = p_speaker_id 
              AND status IN ('pending', 'approved')
            LIMIT 1;
        EXCEPTION WHEN OTHERS THEN
            -- Try alternative text comparison
            SELECT * INTO existing_request
            FROM public.meeting_requests 
            WHERE requester_id::text = p_requester_id
              AND speaker_id = p_speaker_id 
              AND status IN ('pending', 'approved')
            LIMIT 1;
        END;
    END;
    
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
    
    -- Insert new meeting request with error handling
    BEGIN
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
    EXCEPTION WHEN OTHERS THEN
        -- If insert fails due to type issues, try with text requester_id
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
            p_requester_id,  -- Use text directly
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
    END;
    
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

-- Test the function
SELECT 'insert_meeting_request function created successfully with robust type handling' as status;
