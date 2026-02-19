-- Fix slot prioritization: prioritize "interested", exclude "tentative" with meeting_id
-- Also improve handling of duplicate slots (same slot_time with different statuses)

CREATE OR REPLACE FUNCTION get_speaker_available_slots(
    p_speaker_id TEXT,
    p_date DATE DEFAULT NULL,
    p_duration_minutes INTEGER DEFAULT 15,
    p_requester_id UUID DEFAULT NULL
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
BEGIN
    BEGIN
        speaker_uuid_id := p_speaker_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            RETURN;
    END;
    
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = speaker_uuid_id;
    
    IF speaker_user_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Get available slots from user_agenda_status
    -- Priority: "interested" > "available" (exclude "tentative" with meeting_id)
    -- Use DISTINCT ON to handle duplicate slot_times, prioritizing "interested" over "available"
    RETURN QUERY
    SELECT DISTINCT ON (uas.slot_time)
        uas.slot_time,
        uas.slot_time::date as date,
        uas.slot_time::time as start_time,
        (uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL)::time as end_time,
        p_duration_minutes as duration_minutes,
        true as is_available
    FROM public.user_agenda_status uas
    WHERE uas.user_id = speaker_user_id
    AND uas.slot_time IS NOT NULL
    -- Include "interested" and "available", but exclude "tentative" that have meeting_id (booked)
    AND (
        (uas.slot_status = 'interested' AND uas.meeting_id IS NULL) OR
        (uas.slot_status = 'available' AND uas.meeting_id IS NULL)
    )
    AND (p_date IS NULL OR uas.slot_time::date = p_date)
    AND uas.slot_time >= NOW()
    -- Exclude slots that conflict with speaker's existing meetings
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
    -- Check requester conflicts
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.meetings m
            WHERE (
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
    -- Exclude slots where requester has blocked/confirmed/tentative agenda status (if requester_id provided)
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.user_agenda_status uas_req
            WHERE uas_req.user_id = p_requester_id
            AND uas_req.slot_time IS NOT NULL
            AND uas_req.slot_status IN ('blocked', 'confirmed', 'tentative')
            AND uas_req.meeting_id IS NOT NULL  -- Only exclude if actually booked
            AND (
                (uas_req.slot_time <= uas.slot_time AND 
                 uas_req.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas.slot_time) OR
                (uas.slot_time <= uas_req.slot_time AND 
                 uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas_req.slot_time)
            )
        )
    )
    -- Order by status priority: "interested" first, then "available", then by time
    ORDER BY 
        uas.slot_time,
        CASE uas.slot_status 
            WHEN 'interested' THEN 1 
            WHEN 'available' THEN 2 
            ELSE 3 
        END ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_speaker_available_slots IS 'Returns available time slots for a speaker, prioritizing "interested" over "available" and excluding "tentative" slots with meeting_id. Fixed to properly handle duplicate slot_times and use correct speaker_id for conflict checking.';

