-- Fix type mismatch in accept_meeting_request function
-- The speaker_id column may be UUID or TEXT depending on migration state
-- This fix ensures the comparison works regardless of the column type

CREATE OR REPLACE FUNCTION accept_meeting_request(
    p_request_id UUID,
    p_speaker_id TEXT,
    p_slot_start_time TIMESTAMPTZ,
    p_speaker_response TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    speaker_user_id UUID;
    requester_user_id UUID;
    new_meeting_id UUID;
    slot_end_time TIMESTAMPTZ;
    meeting_duration_minutes INTEGER;
    result JSON;
BEGIN
    -- Get the request
    -- Cast speaker_id to TEXT for comparison to handle both UUID and TEXT column types
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id::TEXT = p_speaker_id
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
    
    -- Get speaker's user_id
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;
    
    IF speaker_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Speaker not found'
        );
    END IF;
    
    -- Get requester user_id (already UUID)
    requester_user_id := request_record.requester_id;
    
    -- Store meeting duration for consistent conflict checks
    meeting_duration_minutes := COALESCE(request_record.duration_minutes, 15);
    
    -- Calculate slot end time using the actual meeting duration
    slot_end_time := p_slot_start_time + (meeting_duration_minutes || ' minutes')::INTERVAL;
    
    -- Check if slot is available (not conflicting with existing meetings or blocked slots)
    -- Cast speaker_id to TEXT for comparison
    IF EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            (m.speaker_id::TEXT = p_speaker_id OR m.requester_id = requester_user_id)
            AND m.status IN ('scheduled', 'confirmed', 'tentative')
            AND m.scheduled_at IS NOT NULL
            AND (
                (m.scheduled_at <= p_slot_start_time AND m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > p_slot_start_time) OR
                (p_slot_start_time <= m.scheduled_at AND slot_end_time > m.scheduled_at)
            )
        )
    ) OR EXISTS (
        SELECT 1 FROM public.user_agenda_status uas
        WHERE uas.user_id IN (speaker_user_id, requester_user_id)
        AND uas.slot_time IS NOT NULL
        AND uas.slot_status IN ('blocked', 'confirmed')
        AND (
            (uas.slot_time <= p_slot_start_time AND uas.slot_time + (meeting_duration_minutes || ' minutes')::INTERVAL > p_slot_start_time) OR
            (p_slot_start_time <= uas.slot_time AND slot_end_time > uas.slot_time)
        )
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Selected time slot is not available'
        );
    END IF;
    
    -- Generate meeting ID
    new_meeting_id := gen_random_uuid();
    
    -- Create the meeting
    INSERT INTO public.meetings (
        id,
        meeting_request_id,
        speaker_id,
        requester_id,
        speaker_name,
        requester_name,
        requester_company,
        requester_title,
        meeting_type,
        status,
        scheduled_at,
        duration_minutes,
        created_at,
        updated_at
    ) VALUES (
        new_meeting_id,
        p_request_id,
        p_speaker_id,
        requester_user_id,
        request_record.speaker_name,
        request_record.requester_name,
        request_record.requester_company,
        request_record.requester_title,
        request_record.meeting_type,
        'tentative',
        p_slot_start_time,
        meeting_duration_minutes,
        NOW(),
        NOW()
    );
    
    -- Update meeting request to link to the meeting
    UPDATE meeting_requests
    SET status = 'accepted',
        speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
        speaker_response_at = NOW(),
        meeting_id = new_meeting_id,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Update user_agenda_status for both speaker and requester
    -- For speaker
    INSERT INTO public.user_agenda_status (
        user_id,
        event_id,
        slot_time,
        slot_status,
        meeting_id,
        created_at,
        updated_at
    ) VALUES (
        speaker_user_id,
        'bsl2025',
        p_slot_start_time,
        'tentative',
        new_meeting_id,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, event_id, slot_time) 
    WHERE agenda_id IS NULL
    DO UPDATE SET
        slot_status = 'tentative',
        meeting_id = new_meeting_id,
        updated_at = NOW();
    
    -- For requester
    INSERT INTO public.user_agenda_status (
        user_id,
        event_id,
        slot_time,
        slot_status,
        meeting_id,
        created_at,
        updated_at
    ) VALUES (
        requester_user_id,
        'bsl2025',
        p_slot_start_time,
        'tentative',
        new_meeting_id,
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, event_id, slot_time)
    WHERE agenda_id IS NULL
    DO UPDATE SET
        slot_status = 'tentative',
        meeting_id = new_meeting_id,
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request accepted successfully',
        'meeting_id', new_meeting_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

































