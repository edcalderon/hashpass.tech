-- Convert meeting_requests.speaker_id to UUID and use speaker's user_id
-- This ensures consistency across the database

DO $$
DECLARE
    existing_uuid_count INTEGER;
BEGIN
    -- Drop the foreign key constraint first
    ALTER TABLE public.meeting_requests 
    DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;
    
    -- If column is TEXT, convert existing data first
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_requests' 
        AND column_name = 'speaker_id'
        AND data_type = 'text'
    ) THEN
        -- Update existing records to use user_id from bsl_speakers
        UPDATE public.meeting_requests mr
        SET speaker_id = bs.user_id::text
        FROM public.bsl_speakers bs
        WHERE mr.speaker_id::text = bs.id::text
        AND bs.user_id IS NOT NULL;
        
        -- Delete records where speaker doesn't have user_id (orphaned)
        DELETE FROM public.meeting_requests
        WHERE speaker_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM public.bsl_speakers bs
            WHERE bs.id::text = meeting_requests.speaker_id::text
            AND bs.user_id IS NOT NULL
        );
        
        -- Now change column type to UUID
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN speaker_id TYPE UUID USING speaker_id::UUID;
    END IF;
    
    -- Ensure column is UUID (in case it wasn't TEXT before)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_requests' 
        AND column_name = 'speaker_id'
        AND udt_name != 'uuid'
    ) THEN
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN speaker_id TYPE UUID USING speaker_id::UUID;
    END IF;
    
    -- Note: We don't recreate the foreign key to bsl_speakers.id because
    -- speaker_id now stores user_id (UUID) which references auth.users, not bsl_speakers
    -- If needed, we could add a foreign key to auth.users(id) instead
END $$;

