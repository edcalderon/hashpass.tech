-- Add slot_status to get_speaker_available_slots return type
-- This allows the frontend to differentiate and prioritize slots marked as "interested"

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
    is_available BOOLEAN,
    slot_status TEXT
) AS $$
DECLARE
    speaker_user_id UUID;
    speaker_uuid_id UUID;
    event_start_date DATE := '2025-11-12';
    event_end_date DATE := '2025-11-14';
    slot_start_hour INTEGER := 8;
    slot_end_hour INTEGER := 19;
    slot_interval_minutes INTEGER := 15;
    current_date DATE;
    current_slot TIMESTAMPTZ;
    slot_status TEXT;
    slot_meeting_id UUID;
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
    
    -- Generate slots for event days (Nov 12, 13, 14)
    -- For each day, generate 15-minute slots from 8:00 AM to 7:00 PM
    current_date := event_start_date;
    
    WHILE current_date <= event_end_date LOOP
        -- Skip if p_date is specified and doesn't match
        IF p_date IS NOT NULL AND current_date != p_date THEN
            current_date := current_date + INTERVAL '1 day';
            CONTINUE;
        END IF;
        
        -- Generate slots for this day (8:00 AM to 7:00 PM, 15-minute intervals)
        current_slot := (current_date::TIMESTAMPTZ AT TIME ZONE 'America/Bogota') + (slot_start_hour || ' hours')::INTERVAL;
        
        WHILE EXTRACT(HOUR FROM current_slot AT TIME ZONE 'America/Bogota') < slot_end_hour LOOP
            -- Only include future slots
            IF current_slot >= NOW() THEN
                -- Check if this slot exists in user_agenda_status
                SELECT 
                    uas.slot_status,
                    uas.meeting_id
                INTO 
                    slot_status,
                    slot_meeting_id
                FROM public.user_agenda_status uas
                WHERE uas.user_id = speaker_user_id
                AND uas.slot_time = current_slot
                ORDER BY 
                    CASE uas.slot_status 
                        WHEN 'interested' THEN 1 
                        WHEN 'available' THEN 2 
                        WHEN 'tentative' THEN 3 
                        ELSE 4 
                    END ASC
                LIMIT 1;
                
                -- If slot exists in user_agenda_status, use its status
                -- Otherwise, assume it's free (available)
                IF slot_status IS NULL THEN
                    slot_status := 'available'; -- Infer as free
                END IF;
                
                -- Include slot UNLESS it's blocked or confirmed
                IF slot_status NOT IN ('blocked', 'confirmed') THEN
                    -- Check if slot conflicts with meetings
                    IF NOT EXISTS (
                        SELECT 1 FROM public.meetings m
                        WHERE (
                            (m.speaker_id = speaker_uuid_id OR m.requester_id = speaker_user_id)
                            AND m.status IN ('scheduled', 'confirmed', 'tentative')
                            AND m.scheduled_at IS NOT NULL
                            AND (
                                (m.scheduled_at <= current_slot AND 
                                 m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > current_slot) OR
                                (current_slot <= m.scheduled_at AND 
                                 current_slot + (p_duration_minutes || ' minutes')::INTERVAL > m.scheduled_at)
                            )
                        )
                    ) THEN
                        -- Check requester conflicts if provided
                        IF p_requester_id IS NULL OR NOT EXISTS (
                            SELECT 1 FROM public.meetings m
                            WHERE (
                                (m.requester_id = p_requester_id OR 
                                 (m.speaker_id IN (SELECT id FROM public.bsl_speakers WHERE user_id = p_requester_id)))
                                AND m.status IN ('scheduled', 'confirmed', 'tentative')
                                AND m.scheduled_at IS NOT NULL
                                AND (
                                    (m.scheduled_at <= current_slot AND 
                                     m.scheduled_at + (COALESCE(m.duration_minutes, 15) || ' minutes')::INTERVAL > current_slot) OR
                                    (current_slot <= m.scheduled_at AND 
                                     current_slot + (p_duration_minutes || ' minutes')::INTERVAL > m.scheduled_at)
                                )
                            )
                        ) THEN
                            -- Check requester agenda status conflicts
                            IF p_requester_id IS NULL OR NOT EXISTS (
                                SELECT 1 FROM public.user_agenda_status uas_req
                                WHERE uas_req.user_id = p_requester_id
                                AND uas_req.slot_time IS NOT NULL
                                AND (
                                    uas_req.slot_status IN ('blocked', 'confirmed') OR
                                    (uas_req.slot_status = 'tentative' AND uas_req.meeting_id IS NOT NULL)
                                )
                                AND (
                                    (uas_req.slot_time <= current_slot AND 
                                     uas_req.slot_time + (p_duration_minutes || ' minutes')::INTERVAL > current_slot) OR
                                    (current_slot <= uas_req.slot_time AND 
                                     current_slot + (p_duration_minutes || ' minutes')::INTERVAL > uas_req.slot_time)
                                )
                            ) THEN
                                -- Return this slot with status
                                RETURN QUERY
                                SELECT 
                                    current_slot,
                                    current_date,
                                    current_slot::TIME,
                                    (current_slot + (p_duration_minutes || ' minutes')::INTERVAL)::TIME,
                                    p_duration_minutes,
                                    true,
                                    slot_status;
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END IF;
            
            -- Move to next slot (15 minutes later)
            current_slot := current_slot + (slot_interval_minutes || ' minutes')::INTERVAL;
        END LOOP;
        
        -- Move to next day
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
    
    -- Also return explicitly marked slots (interested/available) that might not be in the generated range
    -- but exist in user_agenda_status
    RETURN QUERY
    SELECT DISTINCT ON (uas.slot_time)
        uas.slot_time,
        uas.slot_time::date as date,
        uas.slot_time::time as start_time,
        (uas.slot_time + (p_duration_minutes || ' minutes')::INTERVAL)::time as end_time,
        p_duration_minutes as duration_minutes,
        true as is_available,
        uas.slot_status
    FROM public.user_agenda_status uas
    WHERE uas.user_id = speaker_user_id
    AND uas.slot_time IS NOT NULL
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
    -- Order by status priority: "interested" first, then "available", then others, then by time
    ORDER BY 
        CASE uas.slot_status 
            WHEN 'interested' THEN 1 
            WHEN 'available' THEN 2 
            WHEN 'tentative' THEN 3 
            ELSE 4 
        END ASC,
        uas.slot_time ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_speaker_available_slots IS 'Returns available time slots for a speaker with slot_status field. Infers free slots from event schedule (Nov 12-14, 8 AM - 7 PM, 15-min intervals). Prioritizes "interested" status slots. Returns slot_status to allow frontend differentiation.';














