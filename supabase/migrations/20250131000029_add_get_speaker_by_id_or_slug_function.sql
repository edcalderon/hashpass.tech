-- Create helper function to get speaker by UUID or old slug
CREATE OR REPLACE FUNCTION get_speaker_by_id_or_slug(p_id TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    title TEXT,
    company TEXT,
    bio TEXT,
    imageurl TEXT,
    linkedin TEXT,
    twitter TEXT,
    tags TEXT[],
    availability JSONB,
    user_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
DECLARE
    v_speaker_id UUID;
BEGIN
    -- Try to convert p_id to UUID first
    BEGIN
        v_speaker_id := p_id::UUID;
    EXCEPTION
        WHEN OTHERS THEN
            -- Not a UUID, try to find in mapping table
            SELECT new_id INTO v_speaker_id
            FROM public.bsl_speakers_id_mapping
            WHERE old_id = p_id;
            
            -- If still not found, try to find by name (case-insensitive)
            IF v_speaker_id IS NULL THEN
                SELECT id INTO v_speaker_id
                FROM public.bsl_speakers
                WHERE LOWER(name) = LOWER(p_id)
                LIMIT 1;
            END IF;
    END;
    
    -- If we found a UUID, return the speaker
    IF v_speaker_id IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            s.id,
            s.name,
            s.title,
            s.company,
            s.bio,
            s.imageurl,
            s.linkedin,
            s.twitter,
            s.tags,
            s.availability,
            s.user_id,
            s.created_at,
            s.updated_at
        FROM public.bsl_speakers s
        WHERE s.id = v_speaker_id;
    END IF;
    
    -- If nothing found, return empty result
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

