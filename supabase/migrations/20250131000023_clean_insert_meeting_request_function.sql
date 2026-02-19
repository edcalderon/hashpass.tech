-- Clean, well-documented version of insert_meeting_request
-- This replaces all previous versions with a single, clear implementation
-- See supabase/functions/meeting-requests/insert_meeting_request.sql for full documentation

CREATE OR REPLACE FUNCTION insert_meeting_request(
    p_requester_id TEXT,
    p_speaker_id TEXT,  -- This is the TEXT id from bsl_speakers, NOT the UUID
    p_speaker_name TEXT,
    p_requester_name TEXT,
    p_requester_company TEXT,
    p_requester_title TEXT,
    p_requester_ticket_type TEXT,
    p_meeting_type TEXT,
    p_message TEXT,
    p_note TEXT DEFAULT NULL,
    p_boost_amount DECIMAL DEFAULT 0,
    p_duration_minutes INTEGER DEFAULT 15,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    new_request_id UUID;
    result JSON;
    pass_record RECORD;
    total_requests INTEGER;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
    requester_uuid UUID;
    speaker_user_id UUID;  -- This will be the UUID from bsl_speakers.user_id
BEGIN
    -- Step 1: Convert requester_id from TEXT to UUID
    BEGIN
        requester_uuid := p_requester_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            result := json_build_object(
                'success', false, 
                'error', 'Invalid requester_id format', 
                'message', 'The requester ID must be a valid UUID'
            );
            RETURN result;
    END;
    
    -- Step 2: Generate new UUID for the meeting request
    new_request_id := gen_random_uuid();
    
    -- Step 3: Get user's pass information
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = p_requester_id
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Step 4: Validate pass exists and is active
    IF NOT FOUND THEN
        result := json_build_object(
            'success', false, 
            'error', 'No active pass found', 
            'message', 'You need an active pass to make meeting requests'
        );
        RETURN result;
    END IF;
    
    IF pass_record.status != 'active' THEN
        result := json_build_object(
            'success', false, 
            'error', 'Pass is not active', 
            'message', 'Your pass is not active'
        );
        RETURN result;
    END IF;
    
    -- Step 5: Count actual meeting requests
    SELECT COUNT(*)
    INTO total_requests
    FROM public.meeting_requests 
    WHERE requester_id = requester_uuid;
    
    -- Step 6: Calculate remaining requests and boost
    remaining_requests := GREATEST(0, COALESCE(pass_record.max_meeting_requests, 0) - total_requests);
    remaining_boost := GREATEST(0, COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0));
    
    -- Step 7: Validate remaining requests
    IF remaining_requests <= 0 THEN
        result := json_build_object(
            'success', false, 
            'error', 'No remaining meeting requests', 
            'message', 'You have no remaining meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Step 8: Validate boost amount
    IF p_boost_amount > remaining_boost THEN
        result := json_build_object(
            'success', false, 
            'error', 'Insufficient boost amount', 
            'message', 'You do not have enough boost amount'
        );
        RETURN result;
    END IF;
    
    -- Step 9: Get speaker's user_id (UUID) from bsl_speakers
    -- CRITICAL: p_speaker_id is TEXT (the id column), we need user_id (UUID)
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;  -- id is TEXT in bsl_speakers
    
    IF NOT FOUND THEN
        result := json_build_object(
            'success', false, 
            'error', 'Speaker not found', 
            'message', 'The specified speaker does not exist'
        );
        RETURN result;
    END IF;
    
    IF speaker_user_id IS NULL THEN
        result := json_build_object(
            'success', false, 
            'error', 'Speaker not linked to user', 
            'message', 'The speaker must be linked to a user account to receive meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Step 10: Ensure speaker_user_id is definitely UUID type
    -- This explicit cast ensures PostgreSQL recognizes it as UUID
    speaker_user_id := speaker_user_id::UUID;
    
    -- Step 11: Insert the meeting request
    -- CRITICAL: meeting_requests.speaker_id is UUID, so we use speaker_user_id (UUID)
    -- NOT p_speaker_id (TEXT)
    INSERT INTO public.meeting_requests (
        id, 
        requester_id,           -- UUID
        speaker_id,             -- UUID (from bsl_speakers.user_id)
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
        new_request_id,                    -- UUID
        requester_uuid,                    -- UUID
        speaker_user_id,                   -- UUID (CRITICAL: This is the UUID, not TEXT)
        p_speaker_name,                     -- TEXT
        p_requester_name,                   -- TEXT
        p_requester_company,                -- TEXT
        p_requester_title,                  -- TEXT
        p_requester_ticket_type,            -- TEXT
        p_meeting_type,                     -- TEXT
        p_message,                          -- TEXT
        p_note,                             -- TEXT
        p_boost_amount,                     -- DECIMAL
        p_duration_minutes,                 -- INTEGER
        COALESCE(p_expires_at, NOW() + INTERVAL '7 days'),  -- TIMESTAMPTZ
        'pending',                          -- TEXT
        NOW(),                              -- TIMESTAMPTZ
        NOW()                               -- TIMESTAMPTZ
    );
    
    -- Step 12: Update pass usage
    UPDATE public.passes 
    SET 
        used_meeting_requests = COALESCE(used_meeting_requests, 0) + 1,
        used_boost_amount = COALESCE(used_boost_amount, 0) + p_boost_amount,
        updated_at = NOW()
    WHERE id = pass_record.id;
    
    -- Step 13: Return success
    result := json_build_object(
        'success', true, 
        'request_id', new_request_id, 
        'message', 'Meeting request created successfully'
    );
    RETURN result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log the full error for debugging
        RAISE WARNING 'insert_meeting_request error: %', SQLERRM;
        result := json_build_object(
            'success', false, 
            'error', SQLERRM, 
            'message', 'Failed to create meeting request: ' || SQLERRM,
            'sqlstate', SQLSTATE
        );
        RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

