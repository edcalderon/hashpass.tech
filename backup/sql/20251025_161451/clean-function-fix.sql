-- Clean fix for function overloading - run this complete script

-- Drop all existing versions to avoid conflicts
DROP FUNCTION IF EXISTS public.can_make_meeting_request(UUID, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS public.can_make_meeting_request(TEXT, TEXT, DECIMAL);
DROP FUNCTION IF EXISTS public.insert_meeting_request(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DECIMAL, INTEGER);

-- Create can_make_meeting_request function
CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
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
BEGIN
    -- Check if user has an active pass
    SELECT 
        p.id, p.pass_type::text, p.status::text, p.pass_number,
        p.max_meeting_requests, p.used_meeting_requests,
        p.max_boost_amount, p.used_boost_amount
    INTO user_pass
    FROM public.passes p
    WHERE p.user_id = p_user_id::text 
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active';

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

    -- Check if there's already a pending request to this speaker
    SELECT * INTO existing_request
    FROM public.meeting_requests mr
    WHERE mr.requester_id = p_user_id::text 
      AND mr.speaker_id = p_speaker_id::text 
      AND mr.status IN ('pending', 'approved');

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

    -- Check if user has enough boost for the requested amount
    IF p_boost_amount > 0 AND remaining_boost < p_boost_amount THEN
        RETURN QUERY SELECT
            FALSE as can_request,
            'Insufficient VOI boost remaining' as reason,
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

-- Create insert_meeting_request function
CREATE OR REPLACE FUNCTION public.insert_meeting_request(
    p_requester_id TEXT,
    p_speaker_id TEXT,
    p_speaker_name TEXT,
    p_requester_name TEXT,
    p_requester_company TEXT DEFAULT NULL,
    p_requester_title TEXT DEFAULT NULL,
    p_requester_ticket_type TEXT DEFAULT 'business',
    p_meeting_type TEXT DEFAULT 'networking',
    p_message TEXT DEFAULT '',
    p_note TEXT DEFAULT NULL,
    p_boost_amount DECIMAL(10,2) DEFAULT 0,
    p_duration_minutes INTEGER DEFAULT 15
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
    priority_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    new_id TEXT;
BEGIN
    -- Generate a unique ID
    new_id := 'MR-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || substr(md5(random()::text), 1, 8);
    
    -- Insert the meeting request
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
        note,
        boost_amount,
        duration_minutes,
        status,
        priority_score,
        created_at,
        updated_at,
        expires_at
    ) VALUES (
        new_id,
        p_requester_id::TEXT,
        p_speaker_id::TEXT,
        p_speaker_name::TEXT,
        p_requester_name::TEXT,
        p_requester_company::TEXT,
        p_requester_title::TEXT,
        p_requester_ticket_type::TEXT,
        p_meeting_type::TEXT,
        p_message::TEXT,
        p_note::TEXT,
        p_boost_amount,
        p_duration_minutes,
        'pending',
        50,
        NOW(),
        NOW(),
        NOW() + INTERVAL '3 days'
    );
    
    -- Return the inserted record
    RETURN QUERY SELECT
        mr.id,
        mr.requester_id,
        mr.speaker_id,
        mr.speaker_name,
        mr.requester_name,
        mr.requester_company,
        mr.requester_title,
        mr.requester_ticket_type,
        mr.meeting_type,
        mr.message,
        mr.note,
        mr.boost_amount,
        mr.duration_minutes,
        mr.status,
        mr.priority_score,
        mr.created_at,
        mr.updated_at,
        mr.expires_at
    FROM public.meeting_requests mr
    WHERE mr.id = new_id;
END;
$$ LANGUAGE plpgsql;
