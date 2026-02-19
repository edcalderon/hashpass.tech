-- Email Tracking System
-- This migration creates a comprehensive system to track which emails have been sent to users

-- Create user_email_tracking table
CREATE TABLE IF NOT EXISTS public.user_email_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL CHECK (email_type IN ('welcome', 'userOnboarding', 'speakerOnboarding')),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'es', 'ko', 'fr', 'pt', 'de')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, email_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_email_tracking_user_id ON public.user_email_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_tracking_email_type ON public.user_email_tracking(email_type);
CREATE INDEX IF NOT EXISTS idx_user_email_tracking_sent_at ON public.user_email_tracking(sent_at);

-- Enable RLS
ALTER TABLE public.user_email_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view their own email tracking
CREATE POLICY "Users can view their own email tracking"
    ON public.user_email_tracking
    FOR SELECT
    USING (auth.uid() = user_id);

-- RLS Policy: Service role can do everything (for backend operations)
CREATE POLICY "Service role can manage email tracking"
    ON public.user_email_tracking
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- RLS Policy: Allow authenticated users to insert their own tracking (for API calls)
CREATE POLICY "Users can insert their own email tracking"
    ON public.user_email_tracking
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Function to check if an email has been sent to a user
-- Users can only check their own email tracking
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
    
    -- Check if email has been sent
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_email_tracking 
        WHERE user_id = p_user_id 
        AND email_type = p_email_type
    ) INTO v_sent;
    
    RETURN v_sent;
END;
$$;

-- Function to mark an email as sent
CREATE OR REPLACE FUNCTION public.mark_email_as_sent(
    p_user_id UUID,
    p_email_type TEXT,
    p_locale TEXT DEFAULT 'en'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tracking_id UUID;
BEGIN
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (p_user_id, p_email_type, p_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale
    RETURNING id INTO v_tracking_id;
    
    RETURN v_tracking_id;
END;
$$;

-- Function to get all emails sent to a user
CREATE OR REPLACE FUNCTION public.get_user_email_tracking(
    p_user_id UUID
)
RETURNS TABLE (
    email_type TEXT,
    sent_at TIMESTAMPTZ,
    locale TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uet.email_type,
        uet.sent_at,
        uet.locale
    FROM public.user_email_tracking uet
    WHERE uet.user_id = p_user_id
    ORDER BY uet.sent_at DESC;
END;
$$;

-- Function to reset email tracking for a user (used when account is deleted)
CREATE OR REPLACE FUNCTION public.reset_user_email_tracking(
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.user_email_tracking
    WHERE user_id = p_user_id;
END;
$$;

-- Trigger to automatically reset email tracking when a user is deleted
CREATE OR REPLACE FUNCTION public.handle_user_deletion_email_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Delete email tracking records when user is deleted
    DELETE FROM public.user_email_tracking
    WHERE user_id = OLD.id;
    
    RETURN OLD;
END;
$$;

-- Create trigger on auth.users deletion
DROP TRIGGER IF EXISTS on_auth_user_deleted_email_tracking ON auth.users;
CREATE TRIGGER on_auth_user_deleted_email_tracking
    AFTER DELETE ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_user_deletion_email_tracking();

-- Function to send welcome email (called from trigger or application)
-- This function will be called by the application, not directly from the trigger
-- The trigger will just mark that a welcome email should be sent
CREATE OR REPLACE FUNCTION public.queue_welcome_email(
    p_user_id UUID,
    p_email TEXT,
    p_locale TEXT DEFAULT 'en'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- This function is a placeholder for the application to call
    -- The actual email sending will be handled by the application layer
    -- We just ensure the tracking is set up correctly
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (p_user_id, 'welcome', p_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale;
END;
$$;

-- Update handle_new_user trigger to also queue welcome email
-- Note: The actual email sending should be done by the application layer
-- This just ensures the tracking record exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    pass_id TEXT;
    user_email TEXT;
    user_locale TEXT := 'en';
BEGIN
    -- Create a default pass for new users
    SELECT create_default_pass(NEW.id, 'general') INTO pass_id;
    
    -- Log the pass creation
    RAISE NOTICE 'Created default pass % for new user %', pass_id, NEW.id;
    
    -- Get user email and locale from metadata
    user_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');
    user_locale := COALESCE(NEW.raw_user_meta_data->>'locale', 'en');
    
    -- Queue welcome email (actual sending will be done by application)
    -- We create a tracking record with sent_at = NOW() but the application
    -- should check and send the email asynchronously
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (NEW.id, 'welcome', user_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO NOTHING;
    
    RAISE NOTICE 'Queued welcome email for user % (email: %, locale: %)', NEW.id, user_email, user_locale;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Failed to create default pass or queue welcome email for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE public.user_email_tracking IS 'Tracks which emails have been sent to each user';
COMMENT ON COLUMN public.user_email_tracking.email_type IS 'Type of email: welcome, userOnboarding, or speakerOnboarding';
COMMENT ON COLUMN public.user_email_tracking.locale IS 'Locale used when sending the email';
COMMENT ON FUNCTION public.has_email_been_sent IS 'Checks if a specific email type has been sent to a user';
COMMENT ON FUNCTION public.mark_email_as_sent IS 'Marks an email as sent for a user';
COMMENT ON FUNCTION public.get_user_email_tracking IS 'Gets all email tracking records for a user';
COMMENT ON FUNCTION public.reset_user_email_tracking IS 'Resets email tracking for a user (used on account deletion)';
COMMENT ON FUNCTION public.queue_welcome_email IS 'Queues a welcome email to be sent (called by application)';

