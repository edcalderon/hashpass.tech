-- Update speaker status functions to accept UUID or slug
CREATE OR REPLACE FUNCTION is_speaker_active(p_speaker_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_speaker_uuid UUID;
BEGIN
    -- Try to convert to UUID
    BEGIN
        v_speaker_uuid := p_speaker_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            -- Not a UUID, try mapping table
            SELECT new_id INTO v_speaker_uuid
            FROM public.bsl_speakers_id_mapping
            WHERE old_id = p_speaker_id;
            
            -- If still not found, try by name
            IF v_speaker_uuid IS NULL THEN
                SELECT id INTO v_speaker_uuid
                FROM public.bsl_speakers
                WHERE LOWER(name) = LOWER(p_speaker_id)
                LIMIT 1;
            END IF;
    END;
    
    IF v_speaker_uuid IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN EXISTS (
        SELECT 1 
        FROM public.bsl_speakers 
        WHERE id = v_speaker_uuid 
        AND user_id IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_speaker_online(p_speaker_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_speaker_uuid UUID;
    v_user_id UUID;
    v_last_sign_in TIMESTAMPTZ;
BEGIN
    -- Try to convert to UUID
    BEGIN
        v_speaker_uuid := p_speaker_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            -- Not a UUID, try mapping table
            SELECT new_id INTO v_speaker_uuid
            FROM public.bsl_speakers_id_mapping
            WHERE old_id = p_speaker_id;
            
            -- If still not found, try by name
            IF v_speaker_uuid IS NULL THEN
                SELECT id INTO v_speaker_uuid
                FROM public.bsl_speakers
                WHERE LOWER(name) = LOWER(p_speaker_id)
                LIMIT 1;
            END IF;
    END;
    
    -- If no speaker found, return false
    IF v_speaker_uuid IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Get user_id from speaker
    SELECT user_id INTO v_user_id
    FROM public.bsl_speakers
    WHERE id = v_speaker_uuid;
    
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

