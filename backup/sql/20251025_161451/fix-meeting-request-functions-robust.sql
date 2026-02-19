-- Fix meeting request functions with robust type casting

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.cancel_meeting_request(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_meeting_request_status(TEXT, TEXT);

-- Create function to get meeting request status with robust type casting
CREATE OR REPLACE FUNCTION public.get_meeting_request_status(
    p_user_id TEXT,
    p_speaker_id TEXT
) RETURNS TABLE(
    id TEXT,
    requester_id TEXT,
    speaker_id TEXT,
    speaker_name TEXT,
    requester_name TEXT,
    requester_company TEXT,
    requester_title TEXT,
    requester_ticket_type TEXT,
    meeting_type TEXT,
    message TEXT,
    note TEXT,
    boost_amount DECIMAL(10,2),
    duration_minutes INTEGER,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ
) AS $$
DECLARE
    request_record RECORD;
    user_id_type TEXT;
    speaker_id_type TEXT;
BEGIN
    -- Check the actual column types in the meeting_requests table
    SELECT data_type INTO user_id_type
    FROM information_schema.columns 
    WHERE table_name = 'meeting_requests' 
      AND column_name = 'requester_id' 
      AND table_schema = 'public';
    
    SELECT data_type INTO speaker_id_type
    FROM information_schema.columns 
    WHERE table_name = 'meeting_requests' 
      AND column_name = 'speaker_id' 
      AND table_schema = 'public';

    -- Find the meeting request based on actual column types
    IF user_id_type = 'uuid' AND speaker_id_type = 'uuid' THEN
        -- Both columns are UUID, cast parameters to UUID
        SELECT * INTO request_record
        FROM public.meeting_requests mr
        WHERE mr.requester_id = p_user_id::uuid
          AND mr.speaker_id = p_speaker_id::uuid
          AND mr.status IN ('pending', 'approved', 'declined', 'cancelled')
        ORDER BY mr.created_at DESC
        LIMIT 1;
    ELSIF user_id_type = 'text' AND speaker_id_type = 'text' THEN
        -- Both columns are TEXT, use TEXT comparison
        SELECT * INTO request_record
        FROM public.meeting_requests mr
        WHERE mr.requester_id = p_user_id
          AND mr.speaker_id = p_speaker_id
          AND mr.status IN ('pending', 'approved', 'declined', 'cancelled')
        ORDER BY mr.created_at DESC
        LIMIT 1;
    ELSE
        -- Mixed types or unknown, try both approaches
        BEGIN
            -- Try UUID first
            SELECT * INTO request_record
            FROM public.meeting_requests mr
            WHERE mr.requester_id = p_user_id::uuid
              AND mr.speaker_id = p_speaker_id::uuid
              AND mr.status IN ('pending', 'approved', 'declined', 'cancelled')
            ORDER BY mr.created_at DESC
            LIMIT 1;
        EXCEPTION
            WHEN invalid_text_representation THEN
                -- Fall back to TEXT comparison
                SELECT * INTO request_record
                FROM public.meeting_requests mr
                WHERE mr.requester_id::text = p_user_id
                  AND mr.speaker_id::text = p_speaker_id
                  AND mr.status IN ('pending', 'approved', 'declined', 'cancelled')
                ORDER BY mr.created_at DESC
                LIMIT 1;
        END;
    END IF;

    -- If no request found, return empty result
    IF request_record IS NULL THEN
        RETURN;
    END IF;

    -- Return the request data
    RETURN QUERY SELECT
        request_record.id::text,
        request_record.requester_id::text,
        request_record.speaker_id::text,
        request_record.speaker_name,
        request_record.requester_name,
        request_record.requester_company,
        request_record.requester_title,
        request_record.requester_ticket_type,
        request_record.meeting_type,
        request_record.message,
        request_record.note,
        request_record.boost_amount,
        request_record.duration_minutes,
        request_record.status,
        request_record.created_at,
        request_record.updated_at,
        request_record.expires_at;
END;
$$ LANGUAGE plpgsql;

-- Create function to cancel a meeting request with robust type casting
CREATE OR REPLACE FUNCTION public.cancel_meeting_request(
    p_user_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    request_record RECORD;
    user_id_type TEXT;
    id_type TEXT;
BEGIN
    -- Check the actual column types in the meeting_requests table
    SELECT data_type INTO user_id_type
    FROM information_schema.columns 
    WHERE table_name = 'meeting_requests' 
      AND column_name = 'requester_id' 
      AND table_schema = 'public';
    
    SELECT data_type INTO id_type
    FROM information_schema.columns 
    WHERE table_name = 'meeting_requests' 
      AND column_name = 'id' 
      AND table_schema = 'public';

    -- Find the meeting request based on actual column types
    IF user_id_type = 'uuid' AND id_type = 'uuid' THEN
        -- Both columns are UUID, cast parameters to UUID
        SELECT * INTO request_record
        FROM public.meeting_requests mr
        WHERE mr.id = p_request_id::uuid
          AND mr.requester_id = p_user_id::uuid
          AND mr.status = 'pending';
    ELSIF user_id_type = 'text' AND id_type = 'text' THEN
        -- Both columns are TEXT, use TEXT comparison
        SELECT * INTO request_record
        FROM public.meeting_requests mr
        WHERE mr.id = p_request_id
          AND mr.requester_id = p_user_id
          AND mr.status = 'pending';
    ELSE
        -- Mixed types or unknown, try both approaches
        BEGIN
            -- Try UUID first
            SELECT * INTO request_record
            FROM public.meeting_requests mr
            WHERE mr.id = p_request_id::uuid
              AND mr.requester_id = p_user_id::uuid
              AND mr.status = 'pending';
        EXCEPTION
            WHEN invalid_text_representation THEN
                -- Fall back to TEXT comparison
                SELECT * INTO request_record
                FROM public.meeting_requests mr
                WHERE mr.id::text = p_request_id
                  AND mr.requester_id::text = p_user_id
                  AND mr.status = 'pending';
        END;
    END IF;

    -- If no pending request found
    IF request_record IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Update the request status to 'cancelled'
    UPDATE public.meeting_requests 
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = request_record.id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
