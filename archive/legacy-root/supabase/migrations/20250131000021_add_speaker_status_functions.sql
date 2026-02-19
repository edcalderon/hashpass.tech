-- Function to check if a speaker is active (has user_id)
CREATE OR REPLACE FUNCTION is_speaker_active(p_speaker_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.bsl_speakers 
        WHERE id = p_speaker_id 
        AND user_id IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if a speaker is online (user last_sign_in_at within last 5 minutes)
-- Note: This requires access to auth.users, so it's SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_speaker_online(p_speaker_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_id UUID;
    v_last_sign_in TIMESTAMPTZ;
BEGIN
    -- Get user_id from speaker
    SELECT user_id INTO v_user_id
    FROM public.bsl_speakers
    WHERE id = p_speaker_id;
    
    -- If no user_id, speaker is not online
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get last_sign_in_at from auth.users
    SELECT last_sign_in_at INTO v_last_sign_in
    FROM auth.users
    WHERE id = v_user_id;
    
    -- If no last_sign_in_at, speaker is not online
    IF v_last_sign_in IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check if last_sign_in_at is within last 5 minutes
    RETURN v_last_sign_in > NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

