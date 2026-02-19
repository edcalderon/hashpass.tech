-- Auto-create pass when user signs up
-- This creates a database trigger that automatically creates a default pass when a new user is created

-- Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    pass_id TEXT;
BEGIN
    -- Create a default pass for new users
    SELECT create_default_pass(NEW.id, 'general') INTO pass_id;
    
    -- Log the pass creation
    RAISE NOTICE 'Created default pass % for new user %', pass_id, NEW.id;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Failed to create default pass for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add comment
COMMENT ON FUNCTION public.handle_new_user IS 'Automatically creates a default pass when a new user signs up.';
