-- Fix meeting_requests speaker_id foreign key constraint
-- If column is UUID but constraint references TEXT, we need to fix this

DO $$
BEGIN
    -- Check if speaker_id column is UUID
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'meeting_requests' 
        AND column_name = 'speaker_id'
        AND udt_name = 'uuid'
    ) THEN
        -- Drop the foreign key constraint if it exists (it will be invalid for UUID->TEXT)
        ALTER TABLE public.meeting_requests 
        DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;
        
        -- Change speaker_id to TEXT
        -- Note: This will convert existing UUID values to TEXT strings
        -- If there are existing meeting requests with UUID speaker_ids, they may need to be updated
        ALTER TABLE public.meeting_requests 
        ALTER COLUMN speaker_id TYPE TEXT USING speaker_id::TEXT;
        
        -- Recreate the foreign key constraint to reference bsl_speakers.id (TEXT)
        ALTER TABLE public.meeting_requests 
        ADD CONSTRAINT meeting_requests_speaker_id_fkey 
        FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;
    ELSE
        -- Column is already TEXT, just ensure the constraint exists and is correct
        -- Drop and recreate to ensure it references the correct column
        ALTER TABLE public.meeting_requests 
        DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;
        
        ALTER TABLE public.meeting_requests 
        ADD CONSTRAINT meeting_requests_speaker_id_fkey 
        FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;
    END IF;
END $$;

