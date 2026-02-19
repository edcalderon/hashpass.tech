-- Fix slot logic: Include ALL slots unless blocked or confirmed with meeting
-- Prioritize "interested" status
-- Logic: All slots are free UNLESS:
--   - Status is "blocked"
--   - Status is "confirmed" (with or without meeting_id - means booked)
--   - Status is "tentative" WITH meeting_id (booked)
-- Include: "interested", "available", "tentative" (without meeting_id)

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
    -- Include: "interested", "available", and "tentative" WITHOUT meeting_id (not booked)
    -- Exclude: "blocked", "confirmed", and "tentative" WITH meeting_id (booked/reserved)
    -- Prioritize "interested" status
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
    -- Include "interested", "available", and "tentative" WITHOUT meeting_id
    -- Exclude "blocked", "confirmed", and "tentative" WITH meeting_id (booked)
    AND (
        uas.slot_status = 'interested' OR
        uas.slot_status = 'available' OR
        (uas.slot_status = 'tentative' AND uas.meeting_id IS NULL)
    )
    AND uas.slot_status NOT IN ('blocked', 'confirmed')
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
    -- Exclude slots where requester has blocked/confirmed/tentative (with meeting_id) agenda status
    AND (
        p_requester_id IS NULL OR
        NOT EXISTS (
            SELECT 1 FROM public.user_agenda_status uas_req
            WHERE uas_req.user_id = p_requester_id
            AND uas_req.slot_time IS NOT NULL
            AND (
                uas_req.slot_status IN ('blocked', 'confirmed') OR
                (uas_req.slot_status = 'tentative' AND uas_req.meeting_id IS NOT NULL)
            )
            AND (
                (uas_req.slot_time <= uas.slot_time AND 
                 uas_req.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas.slot_time) OR
                (uas.slot_time <= uas_req.slot_time AND 
                 uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > uas_req.slot_time)
            )
        )
    )
    -- Order by status priority: "interested" first, then "available", then "tentative", then by time
    ORDER BY 
        uas.slot_time,
        CASE uas.slot_status 
            WHEN 'interested' THEN 1 
            WHEN 'available' THEN 2 
            WHEN 'tentative' THEN 3 
            ELSE 4 
        END ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_speaker_available_slots IS 'Returns available time slots for a speaker. Includes all slots unless blocked or confirmed with meeting. Prioritizes "interested" status. Includes "tentative" slots only if they do not have a meeting_id (not booked).';

