-- Fix conflict checking in get_speaker_available_slots and accept_meeting_request
-- Issue: get_speaker_available_slots was comparing meetings.speaker_id (bsl_speakers.id) 
--        with speaker_user_id (user_id), causing incorrect conflict detection
--        This resulted in slots being shown as available when they actually conflict

-- Drop old function overloads to avoid ambiguity
DROP FUNCTION IF EXISTS accept_meeting_request(p_meeting_request_id uuid, p_speaker_id text, p_scheduled_at timestamp with time zone, p_location text, p_meeting_link text, p_notes text);
DROP FUNCTION IF EXISTS accept_meeting_request(p_request_id uuid, p_speaker_id text, p_speaker_response text);

-- Fix get_speaker_available_slots to use correct speaker_id for conflict checking
CREATE OR REPLACE FUNCTION get_speaker_available_slots(
    p_speaker_id TEXT,
    p_date DATE DEFAULT NULL,
    p_duration_minutes INTEGER DEFAULT 15,
    p_requester_id UUID DEFAULT NULL  -- Optional: check requester conflicts too
) RETURNS TABLE(
    slot_time TIMESTAMPTZ,
    date DATE,
    start_time TIME,
    end_time TIME,
    duration_minutes INTEGER,
    is_available BOOLEAN
) AS $$
DECLARE
    speaker_user_id UUID;
    speaker_uuid_id UUID;
    slot_start TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
BEGIN
    -- Convert p_speaker_id (TEXT) to UUID for comparison with bsl_speakers.id
    BEGIN
        speaker_uuid_id := p_speaker_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            -- If conversion fails, return empty
            RETURN;
    END;
    
    -- Get speaker's user_id
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = speaker_uuid_id;
    
    IF speaker_user_id IS NULL THEN
        RETURN; -- No speaker found
    END IF;
    
    -- Get available slots from user_agenda_status
    -- Slots that are marked as 'available' or 'interested' and not conflicting with meetings
    RETURN QUERY
    SELECT DISTINCT
        uas.slot_time,
        uas.slot_time::date as date,
        uas.slot_time::time as start_time,
        (uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL)::time as end_time,
        p_duration_minutes as duration_minutes,
        true as is_available
    FROM public.user_agenda_status uas
    WHERE uas.user_id = speaker_user_id
    AND uas.slot_time IS NOT NULL
    AND uas.slot_status IN ('available', 'interested')
    AND (p_date IS NULL OR uas.slot_time::date = p_date)
    AND uas.slot_time >= NOW()
    -- Exclude slots that conflict with speaker's existing meetings
    -- FIX: Use speaker_uuid_id (bsl_speakers.id) for meetings.speaker_id comparison
    --      and speaker_user_id for meetings.requester_id comparison
    AND NOT EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            (m.speaker_id = speaker_uuid_id OR m.requester_id = speaker_user_id)
            AND m.status IN ('scheduled', 'confirmed', 'tentative')
            AND m.scheduled_at IS NOT NULL
            AND (
                (m.scheduled_at <= uas.slot_time AND 
                 m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > uas.slot_time) OR
                (uas.slot_time <= m.scheduled_at AND 
                 uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > m.scheduled_at)
            )
        )
    )
    -- Also exclude slots that conflict with requester's existing meetings (if requester_id provided)
    -- FIX: Check both requester_id as requester AND as speaker (if requester is also a speaker)
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.meetings m
            WHERE (
                -- Check if requester is involved in any meeting (as requester or as speaker)
                (m.requester_id = p_requester_id OR 
                 (m.speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = p_requester_id)))
                AND m.status IN ('scheduled', 'confirmed', 'tentative')
                AND m.scheduled_at IS NOT NULL
                AND (
                    (m.scheduled_at <= uas.slot_time AND 
                     m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > uas.slot_time) OR
                    (uas.slot_time <= m.scheduled_at AND 
                     uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > m.scheduled_at)
                )
            )
        )
    )
    -- Also exclude slots where requester has blocked/confirmed agenda status (if requester_id provided)
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.user_agenda_status uas_req
            WHERE uas_req.user_id = p_requester_id
            AND uas_req.slot_time IS NOT NULL
            AND uas_req.slot_status IN ('blocked', 'confirmed', 'tentative')
            AND (
                (uas_req.slot_time <= uas.slot_time AND 
                 uas_req.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas.slot_time) OR
                (uas.slot_time <= uas_req.slot_time AND 
                 uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas_req.slot_time)
            )
        )
    )
    ORDER BY uas.slot_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_speaker_available_slots IS 'Returns available time slots for a speaker, excluding conflicts with existing meetings for both speaker and requester (if provided). Fixed to use correct speaker_id (bsl_speakers.id) for conflict checking.';

-- Also ensure accept_meeting_request uses the same logic
-- The current version already uses speaker_uuid_id correctly, but let's verify the conflict check is comprehensive
CREATE OR REPLACE FUNCTION accept_meeting_request(
    p_request_id UUID,
    p_speaker_id TEXT,
    p_slot_start_time TIMESTAMPTZ,
    p_speaker_response TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    speaker_user_id UUID;
    speaker_uuid_id UUID;
    requester_user_id UUID;
    new_meeting_id UUID;
    slot_end_time TIMESTAMPTZ;
    meeting_duration_minutes INTEGER;
    result JSON;
BEGIN
    -- Convert p_speaker_id (TEXT, which is bsl_speakers.id UUID) to UUID
    BEGIN
        speaker_uuid_id := p_speaker_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN json_build_object(
                'success', false,
                'error', 'Invalid speaker ID format'
            );
    END;
    
    -- Get speaker's user_id from bsl_speakers
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = speaker_uuid_id;
    
    IF speaker_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Speaker not found'
        );
    END IF;
    
    -- Get the request with all necessary fields
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id = speaker_user_id  -- Compare UUID with UUID (meeting_requests.speaker_id is user_id)
      AND status IN ('pending', 'requested');
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found or already processed'
        );
    END IF;
    
    -- Check if request has expired
    IF request_record.expires_at < NOW() THEN
        UPDATE meeting_requests
        SET status = 'expired',
            updated_at = NOW()
        WHERE id = p_request_id;
        
        RETURN json_build_object(
            'success', false,
            'error', 'This request has expired'
        );
    END IF;
    
    -- Get requester user_id (already UUID)
    requester_user_id := request_record.requester_id;
    
    -- Store meeting duration for consistent conflict checks
    meeting_duration_minutes := COALESCE(request_record.duration_minutes, 15);
    
    -- Calculate slot end time
    slot_end_time := p_slot_start_time + (meeting_duration_minutes || ' minutes')::INTERVAL;
    
    -- Check for conflicts with existing meetings
    -- FIX: Ensure we check both speaker (using speaker_uuid_id) and requester (using requester_user_id)
    --      Also check if requester is a speaker and has meetings as a speaker
    IF EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            -- Speaker's meetings (as speaker)
            (m.speaker_id = speaker_uuid_id)
            OR
            -- Speaker's meetings (as requester)
            (m.requester_id = speaker_user_id)
            OR
            -- Requester's meetings (as requester)
            (m.requester_id = requester_user_id)
            OR
            -- Requester's meetings (as speaker, if requester is also a speaker)
            (m.speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = requester_user_id))
        )
        AND m.status IN ('scheduled', 'confirmed', 'tentative')
        AND m.scheduled_at IS NOT NULL
        AND (
            (m.scheduled_at <= p_slot_start_time AND 
             m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > p_slot_start_time) OR
            (p_slot_start_time <= m.scheduled_at AND 
             slot_end_time > m.scheduled_at)
        )
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This time slot conflicts with an existing meeting'
        );
    END IF;
    
    -- Also check user_agenda_status for blocked/confirmed slots
    IF EXISTS (
        SELECT 1 FROM public.user_agenda_status uas
        WHERE uas.user_id IN (speaker_user_id, requester_user_id)
        AND uas.slot_time IS NOT NULL
        AND uas.slot_status IN ('blocked', 'confirmed', 'tentative')
        AND uas.meeting_id IS NOT NULL  -- Only check slots that are actually booked
        AND (
            (uas.slot_time <= p_slot_start_time AND 
             uas.slot_time + (meeting_duration_minutes || ' minutes')::INTERVAL > p_slot_start_time) OR
            (p_slot_start_time <= uas.slot_time AND 
             slot_end_time > uas.slot_time)
        )
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This time slot conflicts with an existing meeting'
        );
    END IF;
    
    -- Create the meeting with all required fields
    -- Note: meetings.speaker_id references bsl_speakers.id (UUID), not user_id
    INSERT INTO public.meetings (
        meeting_request_id,
        speaker_id,  -- This should be bsl_speakers.id (UUID), not user_id
        requester_id,
        speaker_name,
        requester_name,
        requester_company,
        requester_title,
        meeting_type,
        status,
        scheduled_at,
        duration_minutes,
        location,
        meeting_link,
        notes
    ) VALUES (
        p_request_id,  -- meeting_request_id (required NOT NULL)
        speaker_uuid_id,  -- speaker_id: use bsl_speakers.id (UUID) for foreign key constraint
        requester_user_id,  -- requester_id (required NOT NULL)
        COALESCE(request_record.speaker_name, 'Speaker'),  -- speaker_name (required NOT NULL)
        COALESCE(request_record.requester_name, 'User'),  -- requester_name (required NOT NULL)
        request_record.requester_company,  -- requester_company (nullable)
        request_record.requester_title,  -- requester_title (nullable)
        COALESCE(request_record.meeting_type, 'networking'),  -- meeting_type (has default but include for clarity)
        'tentative',  -- status
        p_slot_start_time,  -- scheduled_at
        meeting_duration_minutes,  -- duration_minutes
        NULL,  -- location
        NULL,  -- meeting_link
        COALESCE(p_speaker_response, 'Meeting scheduled')  -- notes
    ) RETURNING id INTO new_meeting_id;
    
    -- Update the meeting request
    UPDATE meeting_requests
    SET 
        status = 'accepted',
        speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
        speaker_response_at = NOW(),
        meeting_id = new_meeting_id,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Update user agenda status for both users
    -- Speaker
    INSERT INTO public.user_agenda_status (
        user_id,
        slot_time,
        slot_status,
        meeting_id
    ) VALUES (
        speaker_user_id,  -- Use user_id for user_agenda_status
        p_slot_start_time,
        'tentative',
        new_meeting_id
    ) ON CONFLICT (user_id, slot_time) 
    DO UPDATE SET 
        slot_status = 'tentative',
        meeting_id = new_meeting_id,
        updated_at = NOW();
    
    -- Requester
    INSERT INTO public.user_agenda_status (
        user_id,
        slot_time,
        slot_status,
        meeting_id
    ) VALUES (
        requester_user_id,
        p_slot_start_time,
        'tentative',
        new_meeting_id
    ) ON CONFLICT (user_id, slot_time) 
    DO UPDATE SET 
        slot_status = 'tentative',
        meeting_id = new_meeting_id,
        updated_at = NOW();
    
    -- Send notifications
    BEGIN
        PERFORM create_notification(
            requester_user_id,
            'meeting_accepted',
            'Meeting Request Accepted',
            'Your meeting request has been accepted. Meeting scheduled for ' || to_char(p_slot_start_time, 'YYYY-MM-DD HH24:MI'),
            p_request_id,
            speaker_user_id,
            false
        );
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail the transaction
            RAISE WARNING 'Failed to create notification: %', SQLERRM;
    END;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request accepted successfully',
        'meeting_id', new_meeting_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION accept_meeting_request IS 'Accepts a meeting request with slot selection. Fixed to properly check conflicts using correct speaker_id (bsl_speakers.id) and comprehensive requester conflict checking.';

