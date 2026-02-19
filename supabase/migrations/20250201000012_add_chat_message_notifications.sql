-- Add notifications for incoming chat messages
-- Create trigger to notify users when they receive chat messages
-- Only notify if user is not actively viewing the chat

-- Function to check if user is actively viewing a chat
CREATE OR REPLACE FUNCTION is_user_viewing_chat(
    p_user_id UUID,
    p_meeting_id UUID,
    p_threshold_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
    v_last_seen_at TIMESTAMPTZ;
BEGIN
    -- Get last seen timestamp
    SELECT last_seen_at INTO v_last_seen_at
    FROM public.chat_last_seen
    WHERE user_id = p_user_id
    AND meeting_id = p_meeting_id;
    
    -- If never seen, user is not viewing
    IF v_last_seen_at IS NULL THEN
        RETURN false;
    END IF;
    
    -- If last seen is within threshold, user is actively viewing
    RETURN (NOW() - v_last_seen_at) < (p_threshold_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create notification for incoming chat message
CREATE OR REPLACE FUNCTION notify_chat_message(
    p_meeting_id UUID,
    p_sender_id UUID,
    p_message TEXT,
    p_message_type TEXT DEFAULT 'text'
) RETURNS JSON AS $$
DECLARE
    v_meeting RECORD;
    v_recipient_id UUID;
    v_sender_name TEXT;
    v_recipient_name TEXT;
    v_meeting_title TEXT;
    v_message_preview TEXT;
    v_notification_id UUID;
    v_is_viewing BOOLEAN;
BEGIN
    -- Get meeting details
    SELECT 
        m.id,
        m.speaker_id,
        m.requester_id,
        m.speaker_name,
        m.requester_name,
        m.status
    INTO v_meeting
    FROM public.meetings m
    WHERE m.id = p_meeting_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;
    
    -- Determine recipient (the one who didn't send the message)
    IF v_meeting.requester_id = p_sender_id THEN
        -- Sender is requester, recipient is speaker
        v_recipient_id := (SELECT user_id FROM public.bsl_speakers WHERE id = v_meeting.speaker_id);
        v_sender_name := v_meeting.requester_name;
        v_recipient_name := v_meeting.speaker_name;
    ELSE
        -- Sender is speaker, recipient is requester
        v_recipient_id := v_meeting.requester_id;
        v_sender_name := v_meeting.speaker_name;
        v_recipient_name := v_meeting.requester_name;
    END IF;
    
    IF v_recipient_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Recipient not found'
        );
    END IF;
    
    -- Check if user is actively viewing the chat (within last 60 seconds)
    SELECT is_user_viewing_chat(v_recipient_id, p_meeting_id, 60) INTO v_is_viewing;
    
    -- Only create notification if user is NOT actively viewing
    IF NOT v_is_viewing THEN
        -- Create meeting title
        v_meeting_title := 'Meeting with ' || v_sender_name;
        
        -- Create message preview (first 100 characters)
        v_message_preview := LEFT(p_message, 100);
        IF LENGTH(p_message) > 100 THEN
            v_message_preview := v_message_preview || '...';
        END IF;
        
        -- Create notification
        SELECT create_notification(
            v_recipient_id,
            'chat_message',
            'New message from ' || v_sender_name,
            v_message_preview,
            NULL, -- meeting_request_id
            NULL, -- speaker_id
            true  -- is_urgent
        ) INTO v_notification_id;
        
        -- Update notification with meeting_id (we'll add this field if needed)
        -- For now, we'll store meeting info in the message field or create a custom field
        
        RETURN json_build_object(
            'success', true,
            'notification_id', v_notification_id,
            'recipient_id', v_recipient_id,
            'is_viewing', false
        );
    ELSE
        -- User is viewing, no notification needed
        RETURN json_build_object(
            'success', true,
            'notification_id', NULL,
            'recipient_id', v_recipient_id,
            'is_viewing', true,
            'message', 'User is actively viewing chat, no notification sent'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger function to automatically notify on message insert
CREATE OR REPLACE FUNCTION trigger_notify_chat_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify if message is not from system
    IF NEW.message_type != 'system' THEN
        PERFORM notify_chat_message(
            NEW.meeting_id,
            NEW.sender_id,
            NEW.message,
            NEW.message_type
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on meeting_chats table
DROP TRIGGER IF EXISTS notify_chat_message_trigger ON public.meeting_chats;
CREATE TRIGGER notify_chat_message_trigger
    AFTER INSERT ON public.meeting_chats
    FOR EACH ROW
    EXECUTE FUNCTION trigger_notify_chat_message();

-- Update create_notification to support meeting_id for chat messages
-- We'll add a meeting_id field to notifications table if it doesn't exist
DO $$
BEGIN
    -- Add meeting_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'notifications' 
        AND column_name = 'meeting_id'
    ) THEN
        ALTER TABLE public.notifications
        ADD COLUMN meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE;
        
        CREATE INDEX IF NOT EXISTS idx_notifications_meeting_id 
        ON public.notifications(meeting_id);
    END IF;
END $$;

-- Update create_notification function to accept meeting_id
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_meeting_request_id UUID DEFAULT NULL,
    p_speaker_id TEXT DEFAULT NULL,
    p_is_urgent BOOLEAN DEFAULT false,
    p_meeting_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    speaker_id_uuid UUID := NULL;
    speaker_id_text TEXT;
BEGIN
    -- Handle speaker_id: only process if provided and not empty
    speaker_id_text := NULLIF(TRIM(COALESCE(p_speaker_id, '')), '');
    
    IF speaker_id_text IS NOT NULL THEN
        BEGIN
            -- Try to convert TEXT to UUID
            speaker_id_uuid := speaker_id_text::UUID;
        EXCEPTION
            WHEN invalid_text_representation THEN
                -- Not a valid UUID string, try lookup in bsl_speakers
                BEGIN
                    SELECT id INTO speaker_id_uuid
                    FROM public.bsl_speakers
                    WHERE CAST(id AS TEXT) = CAST(speaker_id_text AS TEXT)
                    LIMIT 1;
                EXCEPTION
                    WHEN OTHERS THEN
                        speaker_id_uuid := NULL;
                END;
            WHEN OTHERS THEN
                speaker_id_uuid := NULL;
        END;
    END IF;
    
    -- Insert notification with meeting_id support
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent, is_archived, meeting_id
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, speaker_id_uuid, p_is_urgent, false, p_meeting_id
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Update notify_chat_message to include meeting_id in notification
CREATE OR REPLACE FUNCTION notify_chat_message(
    p_meeting_id UUID,
    p_sender_id UUID,
    p_message TEXT,
    p_message_type TEXT DEFAULT 'text'
) RETURNS JSON AS $$
DECLARE
    v_meeting RECORD;
    v_recipient_id UUID;
    v_sender_name TEXT;
    v_recipient_name TEXT;
    v_meeting_title TEXT;
    v_message_preview TEXT;
    v_notification_id UUID;
    v_is_viewing BOOLEAN;
BEGIN
    -- Get meeting details
    SELECT 
        m.id,
        m.speaker_id,
        m.requester_id,
        m.speaker_name,
        m.requester_name,
        m.status
    INTO v_meeting
    FROM public.meetings m
    WHERE m.id = p_meeting_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;
    
    -- Determine recipient (the one who didn't send the message)
    IF v_meeting.requester_id = p_sender_id THEN
        -- Sender is requester, recipient is speaker
        v_recipient_id := (SELECT user_id FROM public.bsl_speakers WHERE id = v_meeting.speaker_id);
        v_sender_name := v_meeting.requester_name;
        v_recipient_name := v_meeting.speaker_name;
    ELSE
        -- Sender is speaker, recipient is requester
        v_recipient_id := v_meeting.requester_id;
        v_sender_name := v_meeting.speaker_name;
        v_recipient_name := v_meeting.requester_name;
    END IF;
    
    IF v_recipient_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Recipient not found'
        );
    END IF;
    
    -- Check if user is actively viewing the chat (within last 60 seconds)
    SELECT is_user_viewing_chat(v_recipient_id, p_meeting_id, 60) INTO v_is_viewing;
    
    -- Only create notification if user is NOT actively viewing
    IF NOT v_is_viewing THEN
        -- Create meeting title
        v_meeting_title := 'New message from ' || v_sender_name;
        
        -- Create message preview (first 100 characters)
        v_message_preview := LEFT(p_message, 100);
        IF LENGTH(p_message) > 100 THEN
            v_message_preview := v_message_preview || '...';
        END IF;
        
        -- Create notification with meeting_id
        SELECT create_notification(
            v_recipient_id,
            'chat_message',
            v_meeting_title,
            v_message_preview,
            NULL, -- meeting_request_id
            NULL, -- speaker_id
            true, -- is_urgent
            p_meeting_id -- meeting_id for link
        ) INTO v_notification_id;
        
        RETURN json_build_object(
            'success', true,
            'notification_id', v_notification_id,
            'recipient_id', v_recipient_id,
            'is_viewing', false
        );
    ELSE
        -- User is viewing, no notification needed
        RETURN json_build_object(
            'success', true,
            'notification_id', NULL,
            'recipient_id', v_recipient_id,
            'is_viewing', true,
            'message', 'User is actively viewing chat, no notification sent'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION is_user_viewing_chat IS 'Checks if user is actively viewing a chat based on last_seen timestamp';
COMMENT ON FUNCTION notify_chat_message IS 'Creates a notification for incoming chat message if user is not actively viewing';
COMMENT ON FUNCTION trigger_notify_chat_message IS 'Trigger function to automatically notify on chat message insert';

