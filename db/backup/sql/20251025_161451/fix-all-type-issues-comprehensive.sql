-- Comprehensive fix for all type casting issues
-- This handles both TEXT and UUID columns by checking actual types

-- 1. Drop all existing problematic functions
DROP FUNCTION IF EXISTS can_make_meeting_request(text, text, numeric);
DROP FUNCTION IF EXISTS can_make_meeting_request(uuid, text, numeric);
DROP FUNCTION IF EXISTS insert_meeting_request(text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS insert_meeting_request(uuid, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone);
DROP FUNCTION IF EXISTS get_meeting_request_status(text, text);
DROP FUNCTION IF EXISTS get_meeting_request_status(uuid, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(text, text);
DROP FUNCTION IF EXISTS cancel_meeting_request(uuid, text);

-- 2. Create can_make_meeting_request with flexible type handling
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id TEXT,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL(10,2) DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type pass_type,
    remaining_requests INTEGER,
    remaining_boost DECIMAL(10,2)
) AS $$
DECLARE
    user_pass RECORD;
    existing_request RECORD;
    remaining_req INTEGER;
    remaining_boost DECIMAL(10,2);
    user_id_uuid UUID;
BEGIN
    -- Try to convert user_id to UUID, if it fails, use as TEXT
    BEGIN
        user_id_uuid := p_user_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        user_id_uuid := NULL;
    END;

    -- Check if user has an active pass (try UUID first, then TEXT)
    IF user_id_uuid IS NOT NULL THEN
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id = user_id_uuid
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    END IF;

    -- If no pass found with UUID, try with TEXT
    IF user_pass IS NULL THEN
        SELECT 
            p.id, p.pass_type::text, p.status::text, p.pass_number,
            p.max_meeting_requests, p.used_meeting_requests,
            p.max_boost_amount, p.used_boost_amount
        INTO user_pass
        FROM public.passes p
        WHERE p.user_id = p_user_id
          AND p.event_id = 'bsl2025' 
          AND p.status = 'active';
    END IF;

    -- If no active pass found
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No active pass found' as reason,
            NULL::pass_type as pass_type,
            0 as remaining_requests,
            0.00 as remaining_boost;
        RETURN;
    END IF;

    -- Check if there's already a pending or approved request to this speaker
    -- Try UUID first, then TEXT
    IF user_id_uuid IS NOT NULL THEN
        SELECT * INTO existing_request
        FROM public.meeting_requests mr
        WHERE mr.requester_id = user_id_uuid
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved');
    END IF;

    -- If no existing request found with UUID, try with TEXT
    IF existing_request IS NULL THEN
        SELECT * INTO existing_request
        FROM public.meeting_requests mr
        WHERE mr.requester_id::text = p_user_id
          AND mr.speaker_id = p_speaker_id 
          AND mr.status IN ('pending', 'approved');
    END IF;

    IF existing_request IS NOT NULL THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'You already have a pending or approved request to this speaker' as reason,
            user_pass.pass_type::pass_type as pass_type,
            (user_pass.max_meeting_requests - user_pass.used_meeting_requests) as remaining_requests,
            (user_pass.max_boost_amount - user_pass.used_boost_amount) as remaining_boost;
        RETURN;
    END IF;

    -- Calculate remaining requests and boost
    remaining_req := user_pass.max_meeting_requests - user_pass.used_meeting_requests;
    remaining_boost := user_pass.max_boost_amount - user_pass.used_boost_amount;

    -- Check if user has enough requests left
    IF remaining_req <= 0 THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'No meeting requests remaining' as reason,
            user_pass.pass_type::pass_type as pass_type,
            remaining_req as remaining_requests,
            remaining_boost as remaining_boost;
        RETURN;
    END IF;

    -- All checks passed - user can make the request
    RETURN QUERY SELECT
        TRUE as can_request,
        'Request allowed' as reason,
        user_pass.pass_type::pass_type as pass_type,
        remaining_req as remaining_requests,
        remaining_boost as remaining_boost;
END;
$$ LANGUAGE plpgsql;

-- 3. Create insert_meeting_request with flexible type handling
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
    p_boost_amount DECIMAL(10,2) DEFAULT 0,
    p_duration_minutes INTEGER DEFAULT 30,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS TABLE(
    id TEXT,
    requester_id TEXT,
    speaker_id TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    new_request_id TEXT;
    existing_request RECORD;
    requester_id_uuid UUID;
BEGIN
    -- Generate new request ID (as TEXT to be safe)
    new_request_id := gen_random_uuid()::text;
    
    -- Try to convert requester_id to UUID
    BEGIN
        requester_id_uuid := p_requester_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        requester_id_uuid := NULL;
    END;
    
    -- Check for existing requests first to prevent duplicates
    -- Try UUID first, then TEXT
    IF requester_id_uuid IS NOT NULL THEN
        SELECT * INTO existing_request
        FROM public.meeting_requests 
        WHERE requester_id = requester_id_uuid
          AND speaker_id = p_speaker_id 
          AND status IN ('pending', 'approved')
        LIMIT 1;
    END IF;

    -- If no existing request found with UUID, try with TEXT
    IF existing_request IS NULL THEN
        SELECT * INTO existing_request
        FROM public.meeting_requests 
        WHERE requester_id::text = p_requester_id
          AND speaker_id = p_speaker_id 
          AND status IN ('pending', 'approved')
        LIMIT 1;
    END IF;
    
    -- If existing request found, return it
    IF existing_request IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            existing_request.id::text,
            existing_request.requester_id::text,
            existing_request.speaker_id,
            existing_request.status,
            existing_request.created_at;
        RETURN;
    END IF;
    
    -- Insert new meeting request
    -- Try UUID first, then fall back to TEXT
    BEGIN
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
            boost_amount,
            duration_minutes,
            expires_at,
            status,
            created_at,
            updated_at
        ) VALUES (
            new_request_id::uuid,
            requester_id_uuid,
            p_speaker_id,
            p_speaker_name,
            p_requester_name,
            p_requester_company,
            p_requester_title,
            p_requester_ticket_type,
            p_meeting_type,
            p_message,
            p_boost_amount,
            p_duration_minutes,
            COALESCE(p_expires_at, NOW() + INTERVAL '7 days'),
            'pending',
            NOW(),
            NOW()
        );
    EXCEPTION WHEN OTHERS THEN
        -- If UUID insert fails, try with TEXT
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
            boost_amount,
            duration_minutes,
            expires_at,
            status,
            created_at,
            updated_at
        ) VALUES (
            new_request_id,
            p_requester_id,
            p_speaker_id,
            p_speaker_name,
            p_requester_name,
            p_requester_company,
            p_requester_title,
            p_requester_ticket_type,
            p_meeting_type,
            p_message,
            p_boost_amount,
            p_duration_minutes,
            COALESCE(p_expires_at, NOW() + INTERVAL '7 days'),
            'pending',
            NOW(),
            NOW()
        );
    END;
    
    -- Return the created request
    RETURN QUERY
    SELECT 
        new_request_id,
        p_requester_id,
        p_speaker_id,
        'pending',
        NOW();
END;
$$ LANGUAGE plpgsql;

-- 4. Create get_meeting_request_status with flexible type handling
CREATE OR REPLACE FUNCTION get_meeting_request_status(
    p_user_id TEXT,
    p_speaker_id TEXT
) RETURNS TABLE(
    id TEXT,
    requester_id TEXT,
    speaker_id TEXT,
    status TEXT,
    message TEXT,
    boost_amount DECIMAL(10,2),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    user_id_uuid UUID;
BEGIN
    -- Try to convert user_id to UUID
    BEGIN
        user_id_uuid := p_user_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        user_id_uuid := NULL;
    END;

    -- Try UUID first, then TEXT
    IF user_id_uuid IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            mr.id::text,
            mr.requester_id::text,
            mr.speaker_id,
            mr.status,
            mr.message,
            mr.boost_amount,
            mr.created_at,
            mr.updated_at
        FROM public.meeting_requests mr
        WHERE mr.requester_id = user_id_uuid
          AND mr.speaker_id = p_speaker_id
          AND mr.status IN ('pending', 'approved', 'declined')
        ORDER BY mr.created_at DESC
        LIMIT 1;
    END IF;

    -- If no result with UUID, try with TEXT
    RETURN QUERY
    SELECT 
        mr.id::text,
        mr.requester_id::text,
        mr.speaker_id,
        mr.status,
        mr.message,
        mr.boost_amount,
        mr.created_at,
        mr.updated_at
    FROM public.meeting_requests mr
    WHERE mr.requester_id::text = p_user_id
      AND mr.speaker_id = p_speaker_id
      AND mr.status IN ('pending', 'approved', 'declined')
    ORDER BY mr.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 5. Create cancel_meeting_request with flexible type handling
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_user_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_id_uuid UUID;
    request_id_uuid UUID;
    rows_affected INTEGER;
BEGIN
    -- Try to convert IDs to UUID
    BEGIN
        user_id_uuid := p_user_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        user_id_uuid := NULL;
    END;

    BEGIN
        request_id_uuid := p_request_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        request_id_uuid := NULL;
    END;

    -- Try UUID first, then TEXT
    IF user_id_uuid IS NOT NULL AND request_id_uuid IS NOT NULL THEN
        UPDATE public.meeting_requests 
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = request_id_uuid 
          AND requester_id = user_id_uuid
          AND status = 'pending';
        
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        
        IF rows_affected > 0 THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- If UUID update failed, try with TEXT
    UPDATE public.meeting_requests 
    SET status = 'cancelled', updated_at = NOW()
    WHERE id::text = p_request_id 
      AND requester_id::text = p_user_id
      AND status = 'pending';
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION can_make_meeting_request(TEXT, TEXT, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meeting_request_status(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_meeting_request(TEXT, TEXT) TO authenticated;

-- 7. Test
SELECT 'All functions created successfully with flexible type handling' as status;
