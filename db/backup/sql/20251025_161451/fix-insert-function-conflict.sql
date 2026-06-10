-- Fix insert_meeting_request function conflict
-- This script removes all conflicting function versions and creates a single clean version

-- 1. Drop ALL existing insert_meeting_request functions to avoid conflicts
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer);

-- 2. Create a single, clean insert_meeting_request function
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
    existing_request RECORD;
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
    
    -- Check for existing requests - use ONLY text comparison
    SELECT * INTO existing_request
    FROM public.meeting_requests 
    WHERE requester_id::text = p_requester_id::text  -- Force text comparison
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

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;

-- 4. Test the function
SELECT 'Function conflict fixed - testing insert_meeting_request...' as status;

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
    'Test meeting request',
    0,
    15,
    NULL
);

SELECT 'Function conflict fix completed successfully!' as status;
