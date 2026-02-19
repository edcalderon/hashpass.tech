-- Enhance get_speaker_available_slots to also check for requester conflicts
-- This ensures slots shown are truly available for both speaker and requester

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
    AND NOT EXISTS (
        SELECT 1 FROM public.meetings m
        WHERE (
            (m.speaker_id = speaker_user_id OR m.requester_id = speaker_user_id)
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
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.meetings m
            WHERE (
                (m.speaker_id = p_requester_id OR m.requester_id = p_requester_id)
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
            AND uas_req.slot_status IN ('blocked', 'confirmed')
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

COMMENT ON FUNCTION get_speaker_available_slots IS 'Returns available time slots for a speaker, excluding conflicts with existing meetings for both speaker and requester (if provided)';


