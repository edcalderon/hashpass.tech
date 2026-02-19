-- Add slot selection to accept meeting request flow
-- When accepting a request, speaker must select an available time slot
-- This creates a meeting and updates both users' agenda status

-- Function to get available slots for a speaker (from user_agenda_status)
-- This considers the speaker's actual schedule and availability
CREATE OR REPLACE FUNCTION get_speaker_available_slots(
    p_speaker_id TEXT,
    p_date DATE DEFAULT NULL,
    p_duration_minutes INTEGER DEFAULT 15
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
    slot_start TIMESTAMPTZ;
    slot_end TIMESTAMPTZ;
BEGIN
    -- Get speaker's user_id
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;
    
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
    -- Exclude slots that conflict with existing meetings
    AND NOT EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            (m.speaker_id = p_speaker_id OR m.requester_id = speaker_user_id)
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
    -- Exclude slots that are already blocked or confirmed
    AND NOT EXISTS (
        SELECT 1 FROM public.user_agenda_status uas2
        WHERE uas2.user_id = speaker_user_id
        AND uas2.slot_time = uas.slot_time
        AND uas2.slot_status IN ('blocked', 'confirmed', 'tentative')
        AND (uas2.meeting_id IS NOT NULL OR uas2.agenda_id IS NOT NULL)
    )
    ORDER BY uas.slot_time
    LIMIT 50; -- Limit to 50 slots to avoid overwhelming the UI
END;
$$ LANGUAGE plpgsql;

-- Add meeting_id column to meeting_requests if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'meeting_requests' 
        AND column_name = 'meeting_id'
    ) THEN
        ALTER TABLE public.meeting_requests
        ADD COLUMN meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_meeting_requests_meeting_id 
        ON public.meeting_requests(meeting_id);
    END IF;
END $$;

-- Updated function to accept meeting request with slot selection
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
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND speaker_id = p_speaker_id
      AND status = 'pending';
    
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
    IF EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            (m.speaker_id = p_speaker_id OR m.requester_id = requester_user_id)
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
        'tentative', -- Start as tentative, can be confirmed later
        p_slot_start_time,
        meeting_duration_minutes,
        NOW(),
        NOW()
    );
    
    -- Update meeting request (link to meeting)
    UPDATE meeting_requests
    SET status = 'accepted',
        speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
        speaker_response_at = NOW(),
        meeting_scheduled_at = p_slot_start_time,
        meeting_id = new_meeting_id,
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Update user_agenda_status for speaker (mark slot as tentative)
    INSERT INTO public.user_agenda_status (
        user_id,
        meeting_id,
        status,
        slot_time,
        slot_status,
        created_at,
        updated_at
    ) VALUES (
        speaker_user_id,
        new_meeting_id,
        'tentative',
        p_slot_start_time,
        'tentative',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, meeting_id) WHERE meeting_id IS NOT NULL
    DO UPDATE SET
        status = 'tentative',
        slot_time = p_slot_start_time,
        slot_status = 'tentative',
        updated_at = NOW();
    
    -- Update user_agenda_status for requester (mark slot as tentative)
    INSERT INTO public.user_agenda_status (
        user_id,
        meeting_id,
        status,
        slot_time,
        slot_status,
        created_at,
        updated_at
    ) VALUES (
        requester_user_id,
        new_meeting_id,
        'tentative',
        p_slot_start_time,
        'tentative',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id, meeting_id) WHERE meeting_id IS NOT NULL
    DO UPDATE SET
        status = 'tentative',
        slot_time = p_slot_start_time,
        slot_status = 'tentative',
        updated_at = NOW();
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request accepted and scheduled',
        'meeting_id', new_meeting_id,
        'scheduled_at', p_slot_start_time
    );
END;
$$ LANGUAGE plpgsql;

