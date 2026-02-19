-- Add chat last seen tracking system
-- Track when users last viewed a meeting chat

-- Create table to track last seen timestamps for meeting chats
CREATE TABLE IF NOT EXISTS public.chat_last_seen (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_meeting_chat_last_seen UNIQUE (user_id, meeting_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_last_seen_user_id ON public.chat_last_seen(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_last_seen_meeting_id ON public.chat_last_seen(meeting_id);
CREATE INDEX IF NOT EXISTS idx_chat_last_seen_last_seen_at ON public.chat_last_seen(last_seen_at);

-- Enable RLS
ALTER TABLE public.chat_last_seen ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own last seen records
CREATE POLICY chat_last_seen_select ON public.chat_last_seen
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own last seen records
CREATE POLICY chat_last_seen_insert ON public.chat_last_seen
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own last seen records
CREATE POLICY chat_last_seen_update ON public.chat_last_seen
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_chat_last_seen_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER chat_last_seen_updated_at
    BEFORE UPDATE ON public.chat_last_seen
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_last_seen_updated_at();

-- Function to update or insert last seen timestamp
CREATE OR REPLACE FUNCTION update_chat_last_seen(
    p_user_id UUID,
    p_meeting_id UUID
) RETURNS JSON AS $$
DECLARE
    v_last_seen_at TIMESTAMPTZ;
BEGIN
    -- Upsert last seen timestamp
    INSERT INTO public.chat_last_seen (user_id, meeting_id, last_seen_at)
    VALUES (p_user_id, p_meeting_id, NOW())
    ON CONFLICT (user_id, meeting_id)
    DO UPDATE SET
        last_seen_at = NOW(),
        updated_at = NOW()
    RETURNING last_seen_at INTO v_last_seen_at;
    
    RETURN json_build_object(
        'success', true,
        'last_seen_at', v_last_seen_at
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get last seen timestamp for a user and meeting
CREATE OR REPLACE FUNCTION get_chat_last_seen(
    p_user_id UUID,
    p_meeting_id UUID
) RETURNS JSON AS $$
DECLARE
    v_last_seen_at TIMESTAMPTZ;
BEGIN
    SELECT last_seen_at INTO v_last_seen_at
    FROM public.chat_last_seen
    WHERE user_id = p_user_id
    AND meeting_id = p_meeting_id;
    
    IF v_last_seen_at IS NULL THEN
        RETURN json_build_object(
            'success', true,
            'last_seen_at', NULL,
            'has_seen', false
        );
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'last_seen_at', v_last_seen_at,
        'has_seen', true
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread message count for a user in a meeting chat
CREATE OR REPLACE FUNCTION get_unread_chat_message_count(
    p_user_id UUID,
    p_meeting_id UUID
) RETURNS JSON AS $$
DECLARE
    v_last_seen_at TIMESTAMPTZ;
    v_unread_count INTEGER;
BEGIN
    -- Get last seen timestamp
    SELECT last_seen_at INTO v_last_seen_at
    FROM public.chat_last_seen
    WHERE user_id = p_user_id
    AND meeting_id = p_meeting_id;
    
    -- If never seen, count all messages except own
    IF v_last_seen_at IS NULL THEN
        SELECT COUNT(*) INTO v_unread_count
        FROM public.meeting_chats
        WHERE meeting_id = p_meeting_id
        AND sender_id != p_user_id;
    ELSE
        -- Count messages after last seen
        SELECT COUNT(*) INTO v_unread_count
        FROM public.meeting_chats
        WHERE meeting_id = p_meeting_id
        AND sender_id != p_user_id
        AND created_at > v_last_seen_at;
    END IF;
    
    RETURN json_build_object(
        'success', true,
        'unread_count', COALESCE(v_unread_count, 0),
        'last_seen_at', v_last_seen_at
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM,
            'unread_count', 0
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.chat_last_seen IS 'Tracks when users last viewed meeting chats';
COMMENT ON FUNCTION update_chat_last_seen IS 'Updates or inserts the last seen timestamp for a user in a meeting chat';
COMMENT ON FUNCTION get_chat_last_seen IS 'Gets the last seen timestamp for a user in a meeting chat';
COMMENT ON FUNCTION get_unread_chat_message_count IS 'Gets the count of unread messages for a user in a meeting chat';

