-- Fix handle_new_user trigger to prevent duplicate welcome emails
-- The trigger should NOT create a tracking record with sent_at, as this can cause
-- race conditions where the application thinks the email was already sent
-- Instead, let the application handle email tracking completely

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
    
    -- DO NOT create email tracking record here
    -- The application will handle email sending and tracking
    -- This prevents race conditions and duplicate emails
    -- The application checks has_email_been_sent before sending,
    -- and only marks as sent after successfully sending with message_id
    
    RAISE NOTICE 'New user created: % (email: %, locale: %) - email will be sent by application on first login', NEW.id, user_email, user_locale;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Failed to create default pass for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates a default pass when a new user signs up. Email tracking is handled by the application layer to prevent duplicates.';

