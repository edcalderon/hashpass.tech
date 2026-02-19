-- Fix welcome email tracking to ensure emails are sent on login if not already sent
-- This migration adds a function to reset welcome email tracking if email wasn't actually sent

-- Add message_id column to track if email was actually sent
ALTER TABLE public.user_email_tracking 
ADD COLUMN IF NOT EXISTS message_id TEXT;

-- Create index for message_id
CREATE INDEX IF NOT EXISTS idx_user_email_tracking_message_id ON public.user_email_tracking(message_id) WHERE message_id IS NOT NULL;

-- Function to reset welcome email tracking if email wasn't actually sent
-- This checks if the tracking record exists but has no message_id, meaning email wasn't sent
CREATE OR REPLACE FUNCTION public.reset_welcome_email_if_not_sent(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete the tracking record if it exists but has no message_id
    -- This means the email was queued by the trigger but never actually sent
    DELETE FROM public.user_email_tracking
    WHERE user_id = p_user_id
    AND email_type = 'welcome'
    AND (message_id IS NULL OR message_id = '');
END;
$$;

-- Update mark_email_as_sent to accept message_id
CREATE OR REPLACE FUNCTION public.mark_email_as_sent(
    p_user_id UUID,
    p_email_type TEXT,
    p_locale TEXT DEFAULT 'en',
    p_message_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tracking_id UUID;
BEGIN
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at, message_id)
    VALUES (p_user_id, p_email_type, p_locale, NOW(), p_message_id)
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale,
        message_id = COALESCE(p_message_id, user_email_tracking.message_id);
    
    SELECT id INTO v_tracking_id
    FROM public.user_email_tracking
    WHERE user_id = p_user_id AND email_type = p_email_type;
    
    RETURN v_tracking_id;
END;
$$;

-- Update has_email_been_sent to check if email was actually sent (has message_id)
CREATE OR REPLACE FUNCTION public.has_email_been_sent(
    p_user_id UUID,
    p_email_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sent BOOLEAN;
    v_current_user_id UUID;
BEGIN
    -- Get current authenticated user ID
    v_current_user_id := auth.uid();
    
    -- Security check: users can only check their own email tracking
    -- Service role can check any user's tracking
    IF v_current_user_id IS NULL THEN
        -- No authenticated user, deny access
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    IF v_current_user_id != p_user_id AND (auth.jwt() ->> 'role') != 'service_role' THEN
        -- User is trying to check another user's tracking, deny access
        RAISE EXCEPTION 'Access denied: can only check own email tracking';
    END IF;
    
    -- Check if email has been sent (must have message_id to be considered sent)
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_email_tracking 
        WHERE user_id = p_user_id 
        AND email_type = p_email_type
        AND message_id IS NOT NULL
        AND message_id != ''
    ) INTO v_sent;
    
    RETURN v_sent;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.reset_welcome_email_if_not_sent IS 'Resets welcome email tracking if email was not actually sent (no message_id)';
COMMENT ON COLUMN public.user_email_tracking.message_id IS 'Message ID from email service, indicates email was actually sent';

