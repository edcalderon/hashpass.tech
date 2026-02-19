-- Add archive fields to notifications table
-- This migration adds is_archived and archived_at columns to support archiving notifications

-- Add is_archived column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'is_archived'
    ) THEN
        ALTER TABLE notifications 
        ADD COLUMN is_archived BOOLEAN DEFAULT false NOT NULL;
    END IF;
END $$;

-- Add archived_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'archived_at'
    ) THEN
        ALTER TABLE notifications 
        ADD COLUMN archived_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update existing notifications to have is_archived = false (in case default wasn't applied)
UPDATE notifications 
SET is_archived = false 
WHERE is_archived IS NULL;

-- Create index for better query performance when filtering archived notifications
CREATE INDEX IF NOT EXISTS idx_notifications_is_archived ON notifications(is_archived);
CREATE INDEX IF NOT EXISTS idx_notifications_user_archived ON notifications(user_id, is_archived);

-- Update the create_notification function to include archive fields
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
BEGIN
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent, is_archived
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, p_speaker_id, p_is_urgent, false
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

