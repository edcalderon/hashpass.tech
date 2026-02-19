-- Fix insert_meeting_request using direct INSERT with VALUES
-- This ensures PostgreSQL recognizes the UUID type correctly
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
    speaker_user_id UUID;
BEGIN
    -- Convert text to uuid for requester_id
    requester_uuid := p_requester_id::uuid;
    
    -- Generate new UUID for the request
    new_request_id := gen_random_uuid();
    
    -- Get user's pass information
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
    
    -- Count actual meeting requests from database (use uuid for comparison)
    SELECT COUNT(*)
    INTO total_requests
    FROM public.meeting_requests 
    WHERE requester_id = requester_uuid;
    
    -- Calculate remaining requests and boost
    remaining_requests := GREATEST(0, COALESCE(pass_record.max_meeting_requests, 0) - total_requests);
    remaining_boost := GREATEST(0, COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0));
    
    -- Check remaining requests
    IF remaining_requests <= 0 THEN
        result := json_build_object(
            'success', false, 
            'error', 'No remaining meeting requests', 
            'message', 'You have no remaining meeting requests'
        );
        RETURN result;
    END IF;
    
    -- Check boost amount
    IF p_boost_amount > remaining_boost THEN
        result := json_build_object(
            'success', false, 
            'error', 'Insufficient boost amount', 
            'message', 'You do not have enough boost amount'
        );
        RETURN result;
    END IF;
    
    -- Get speaker's user_id (UUID) from bsl_speakers using the TEXT id
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;
    
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
    
    -- Ensure speaker_user_id is definitely UUID type
    speaker_user_id := speaker_user_id::UUID;
    
    -- Insert the meeting request with UUID speaker_id (user_id)
    -- Use direct INSERT with VALUES - PostgreSQL will infer types from the variables
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
        new_request_id,                    -- UUID (already UUID type)
        requester_uuid,                    -- UUID (already UUID type)
        speaker_user_id,                   -- UUID (explicitly cast above)
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
    
    -- Update pass usage (increment used_meeting_requests and used_boost_amount)
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
            'message', 'Failed to create meeting request: ' || SQLERRM
        );
        RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

