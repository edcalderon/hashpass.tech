-- Create notifications table
-- This table stores all user notifications for the application

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('meeting_request', 'meeting_accepted', 'meeting_declined', 'meeting_reminder', 'meeting_expired', 'meeting_cancelled', 'boost_received', 'system_alert', 'chat_message')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    is_urgent BOOLEAN NOT NULL DEFAULT false,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    meeting_request_id UUID,
    speaker_id TEXT,
    meeting_id UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_is_archived ON public.notifications(is_archived);
CREATE INDEX IF NOT EXISTS idx_notifications_user_archived ON public.notifications(user_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_meeting_id ON public.notifications(meeting_id);
CREATE INDEX IF NOT EXISTS idx_notifications_meeting_request_id ON public.notifications(meeting_request_id);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
    ON public.notifications
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Users can update their own notifications (mark as read, archived)
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
    ON public.notifications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own notifications
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications"
    ON public.notifications
    FOR DELETE
    USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all notifications
DROP POLICY IF EXISTS "Service role can manage all notifications" ON public.notifications;
CREATE POLICY "Service role can manage all notifications"
    ON public.notifications
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to create notifications
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
BEGIN
    INSERT INTO public.notifications (
        user_id, 
        type, 
        title, 
        message, 
        meeting_request_id, 
        speaker_id, 
        is_urgent,
        meeting_id,
        is_archived
    ) VALUES (
        p_user_id, 
        p_type, 
        p_title, 
        p_message,
        p_meeting_request_id, 
        p_speaker_id, 
        p_is_urgent,
        p_meeting_id,
        false
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add comment
COMMENT ON TABLE public.notifications IS 'User notifications for meeting requests, chat messages, and system alerts';
