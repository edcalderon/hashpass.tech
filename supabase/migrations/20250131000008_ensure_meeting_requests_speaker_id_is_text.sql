-- Ensure meeting_requests.speaker_id is TEXT to match bsl_speakers.id
-- This migration is idempotent - it will only change the type if needed

DO $$
BEGIN
    -- Check if speaker_id is not TEXT
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_requests' 
        AND column_name = 'speaker_id'
        AND data_type != 'text'
    ) THEN
        -- Drop the foreign key constraint first
        ALTER TABLE public.meeting_requests 
        DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;
        
        -- Change speaker_id to TEXT
        -- Note: This will fail if there are existing UUID values that can't be converted
        -- In that case, we'd need to clean up the data first
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN speaker_id TYPE TEXT USING speaker_id::TEXT;
        
        -- Recreate the foreign key constraint
        ALTER TABLE public.meeting_requests 
        ADD CONSTRAINT meeting_requests_speaker_id_fkey 
        FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;
    END IF;
END $$;

