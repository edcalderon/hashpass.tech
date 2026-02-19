-- Fix insert_meeting_request to handle foreign key constraint correctly
-- Ensure speaker_id matches bsl_speakers.id (TEXT) format
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
    speaker_id_for_insert TEXT;
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
    
    -- Verify speaker exists in bsl_speakers before inserting
    IF NOT EXISTS (SELECT 1 FROM public.bsl_speakers WHERE id = p_speaker_id) THEN
        result := json_build_object(
            'success', false, 
            'error', 'Speaker not found', 
            'message', 'The specified speaker does not exist'
        );
        RETURN result;
    END IF;
    
    -- Use speaker_id as TEXT (matches bsl_speakers.id which is TEXT)
    speaker_id_for_insert := p_speaker_id;
    
    -- Insert the meeting request
    BEGIN
        INSERT INTO public.meeting_requests (
            id, requester_id, speaker_id, speaker_name, requester_name,
            requester_company, requester_title, requester_ticket_type,
            meeting_type, message, note, boost_amount, duration_minutes,
            expires_at, status, created_at, updated_at
        ) VALUES (
            new_request_id, 
            requester_uuid, 
            speaker_id_for_insert,  -- Use TEXT speaker_id
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
    EXCEPTION
        WHEN foreign_key_violation THEN
            -- Foreign key constraint failed - column might be UUID but FK references TEXT
            -- This indicates a schema mismatch that needs to be fixed
            result := json_build_object(
                'success', false, 
                'error', 'Database schema mismatch', 
                'message', 'The speaker_id column type does not match the foreign key constraint. Please contact support.'
            );
            RETURN result;
        WHEN datatype_mismatch OR invalid_text_representation THEN
            -- Column is UUID but we're passing TEXT
            result := json_build_object(
                'success', false, 
                'error', 'Type mismatch', 
                'message', 'The speaker_id column is UUID but speaker ID is TEXT. The database schema needs to be updated.'
            );
            RETURN result;
    END;
    
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

