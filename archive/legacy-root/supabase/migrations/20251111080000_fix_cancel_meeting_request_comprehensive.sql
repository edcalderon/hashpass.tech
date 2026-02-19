-- Comprehensive fix for cancel_meeting_request and related functions
-- This migration ensures all TEXT/UUID comparisons are properly handled
-- and documents all RPC functions for visibility

-- ============================================================================
-- FUNCTION: cancel_meeting_request
-- ============================================================================
-- Purpose: Cancels a meeting request and restores request limit (not boost points)
-- Parameters:
--   p_request_id UUID - The meeting request ID to cancel
--   p_user_id UUID - The user ID of the requester (for authorization)
-- Returns: JSON with success status and message/error
-- ============================================================================
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_request_id UUID,
    p_user_id UUID
) RETURNS JSON AS $$
DECLARE
    request_record RECORD;
    user_pass RECORD;
    speaker_user_id UUID;
BEGIN
    -- Get the request and verify it belongs to the user
    SELECT * INTO request_record
    FROM meeting_requests
    WHERE id = p_request_id
      AND requester_id = p_user_id;
    
    -- Check if request was found
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Request not found or you do not have permission to cancel it'
        );
    END IF;
    
    -- Check if request can be cancelled
    IF request_record.status NOT IN ('pending', 'requested', 'accepted') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This request cannot be cancelled. Only pending or requested requests can be cancelled.'
        );
    END IF;
    
    -- Check if request is already cancelled
    IF request_record.status = 'cancelled' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'This request has already been cancelled'
        );
    END IF;
    
    -- Get user's pass to restore request limit
    -- KEY FIX: passes.user_id is TEXT, so cast p_user_id (UUID) to TEXT
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id::TEXT  -- Cast UUID to TEXT for comparison
    AND event_id = 'bsl2025' 
    AND status = 'active'
    LIMIT 1;
    
    -- Update request to cancelled
    UPDATE meeting_requests
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE id = p_request_id;
    
    -- Restore request limit (but NOT boost points)
    IF user_pass IS NOT NULL THEN
        UPDATE passes 
        SET 
            used_meeting_requests = GREATEST(0, used_meeting_requests - 1),
            updated_at = NOW()
        WHERE id = user_pass.id;
    END IF;
    
    -- meeting_requests.speaker_id is UUID (user_id)
    speaker_user_id := request_record.speaker_id;
    
    -- Send notification to requester (speaker_id not needed since it's not used)
    BEGIN
        PERFORM create_notification(
            p_user_id,
            'meeting_cancelled',
            'Meeting Request Cancelled',
            'You have cancelled your meeting request to ' || COALESCE(request_record.speaker_name, 'the speaker') || '. Your request limit has been restored, but boost points are not refunded.',
            p_request_id,
            NULL::TEXT, -- Explicitly cast NULL to TEXT to avoid type issues
            false
        );
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to create notification for requester: %', SQLERRM;
    END;
    
    -- Send notification to speaker (speaker_id not needed since it's not used)
    BEGIN
        IF speaker_user_id IS NOT NULL THEN
            PERFORM create_notification(
                speaker_user_id,
                'meeting_cancelled',
                'Meeting Request Cancelled',
                COALESCE(request_record.requester_name, 'A user') || ' has cancelled their meeting request.',
                p_request_id,
                NULL::TEXT, -- Explicitly cast NULL to TEXT to avoid type issues
                false
            );
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Failed to create notification for speaker: %', SQLERRM;
    END;
    
    RETURN json_build_object(
        'success', true,
        'message', 'Meeting request cancelled successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cancel_meeting_request(UUID, UUID) IS 'Cancels a meeting request. Restores request limit but does NOT refund boost points. Simplified - speaker_id in notifications is not used.';

-- ============================================================================
-- FUNCTION: create_notification
-- ============================================================================
-- Purpose: Creates a notification record
-- Parameters:
--   p_user_id UUID - The user to notify
--   p_type TEXT - Notification type
--   p_title TEXT - Notification title
--   p_message TEXT - Notification message
--   p_meeting_request_id UUID (optional) - Related meeting request ID
--   p_speaker_id TEXT (optional) - Speaker ID (not currently used in frontend)
--   p_is_urgent BOOLEAN (optional) - Whether notification is urgent
-- Returns: UUID of the created notification
-- ============================================================================
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_meeting_request_id UUID DEFAULT NULL,
    p_speaker_id TEXT DEFAULT NULL,
    p_is_urgent BOOLEAN DEFAULT false
) RETURNS UUID AS $$
DECLARE
    notification_id UUID;
    speaker_id_uuid UUID := NULL;
    speaker_id_text TEXT;
BEGIN
    -- Handle speaker_id: only process if provided and not empty
    -- Use a separate variable to avoid any type confusion
    speaker_id_text := NULLIF(TRIM(COALESCE(p_speaker_id, '')), '');
    
    IF speaker_id_text IS NOT NULL THEN
        BEGIN
            -- Try to convert TEXT to UUID
            speaker_id_uuid := speaker_id_text::UUID;
        EXCEPTION
            WHEN invalid_text_representation THEN
                -- Not a valid UUID string, try lookup in bsl_speakers
                -- Use explicit CAST on both sides to be absolutely safe
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
    
    -- Insert notification
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent, is_archived
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, speaker_id_uuid, p_is_urgent, false
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_notification IS 'Creates a notification. Absolutely safe from text = uuid errors using explicit CAST on both sides of comparisons.';

-- ============================================================================
-- FUNCTION: notify_meeting_status_change (TRIGGER FUNCTION)
-- ============================================================================
-- Purpose: Trigger function that sends notifications when meeting request status changes
-- Trigger: AFTER UPDATE on meeting_requests table
-- Notes: meeting_requests.speaker_id is UUID (user_id), not bsl_speakers.id
-- ============================================================================
CREATE OR REPLACE FUNCTION notify_meeting_status_change() RETURNS TRIGGER AS $$
DECLARE
    speaker_user_id UUID;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        -- Only act when status changes
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            -- meeting_requests.speaker_id is UUID (user_id)
            speaker_user_id := NEW.speaker_id;
            
            -- Send notifications based on new status
            CASE NEW.status
                WHEN 'accepted' THEN
                    -- Notify requester (speaker_id not needed)
                    PERFORM create_notification(
                        NEW.requester_id,
                        'meeting_accepted',
                        'Meeting Request Accepted! 🎉',
                        COALESCE(NEW.speaker_name, 'The speaker') || ' has accepted your meeting request',
                        NEW.id,
                        NULL::TEXT, -- Explicitly cast NULL to TEXT
                        true
                    );
                    
                    -- Notify speaker
                    IF speaker_user_id IS NOT NULL THEN
                        PERFORM create_notification(
                            speaker_user_id,
                            'meeting_accepted',
                            'Request Accepted',
                            'You have accepted the meeting request from ' || COALESCE(NEW.requester_name, 'a user'),
                            NEW.id,
                            NULL::TEXT, -- Explicitly cast NULL to TEXT
                            false
                        );
                    END IF;
                    
                WHEN 'declined' THEN
                    -- Notify requester
                    PERFORM create_notification(
                        NEW.requester_id,
                        'meeting_declined',
                        'Meeting Request Declined',
                        COALESCE(NEW.speaker_name, 'The speaker') || ' has declined your meeting request. Your request and boost amount have been refunded.',
                        NEW.id,
                        NULL::TEXT, -- Explicitly cast NULL to TEXT
                        false
                    );
                    
                    -- Notify speaker
                    IF speaker_user_id IS NOT NULL THEN
                        PERFORM create_notification(
                            speaker_user_id,
                            'meeting_declined',
                            'Request Declined',
                            'You have declined the meeting request from ' || COALESCE(NEW.requester_name, 'a user'),
                            NEW.id,
                            NULL::TEXT, -- Explicitly cast NULL to TEXT
                            false
                        );
                    END IF;
                    
                WHEN 'expired' THEN
                    -- Notify requester
                    PERFORM create_notification(
                        NEW.requester_id,
                        'meeting_expired',
                        'Meeting Request Expired',
                        'Your meeting request to ' || COALESCE(NEW.speaker_name, 'the speaker') || ' has expired. Your request and boost amount have been refunded.',
                        NEW.id,
                        NULL::TEXT, -- Explicitly cast NULL to TEXT
                        false
                    );
                    
                WHEN 'cancelled' THEN
                    -- Skip notification here - cancel_meeting_request function handles it
                    NULL;
                    
                ELSE
                    -- For any other status changes, do nothing
                    NULL;
            END CASE;
            
            -- Update pass based on response (if function exists)
            BEGIN
                PERFORM update_pass_after_response(
                    NEW.requester_id,
                    NEW.id,
                    NEW.status
                );
            EXCEPTION
                WHEN undefined_function THEN
                    NULL;
            END;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION notify_meeting_status_change IS 'Trigger function to send notifications when meeting request status changes. Simplified - speaker_id in notifications is not used.';

-- ============================================================================
-- FUNCTION: update_pass_after_response
-- ============================================================================
-- Purpose: Updates pass limits after a meeting request response
-- Parameters:
--   p_user_id UUID - The user's ID
--   p_meeting_request_id UUID - The meeting request ID
--   p_status TEXT - The new status ('declined', 'expired', etc.)
-- Returns: BOOLEAN indicating success
-- ============================================================================
CREATE OR REPLACE FUNCTION update_pass_after_response(
    p_user_id UUID,
    p_meeting_request_id UUID,
    p_status TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_pass RECORD;
    meeting_request RECORD;
BEGIN
    -- Get meeting request details
    SELECT * INTO meeting_request 
    FROM meeting_requests 
    WHERE id = p_meeting_request_id;
    
    IF meeting_request IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get user's pass
    -- KEY FIX: passes.user_id is TEXT, so cast p_user_id (UUID) to TEXT
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id::TEXT  -- Cast UUID to TEXT for comparison
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass based on response
    -- Note: Only 'declined' status refunds request and boost
    -- 'cancelled' status is handled by cancel_meeting_request function
    IF p_status = 'declined' THEN
        -- Refund the request and boost amount
        UPDATE passes 
        SET 
            used_meeting_requests = GREATEST(0, used_meeting_requests - 1),
            used_boost_amount = GREATEST(0, used_boost_amount - COALESCE(meeting_request.boost_amount, 0)),
            updated_at = NOW()
        WHERE id = user_pass.id;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_pass_after_response IS 'Updates pass limits after a meeting request response. Only handles declined status - cancelled is handled separately.';

