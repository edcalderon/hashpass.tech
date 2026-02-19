-- Remove duplicate speaker record for Ana María Zuluaga
-- Keep the older record (dd63f552-f773-5e1f-88fa-5c8276a74066) which has more complete data
-- Delete the newer duplicate (47b9f590-a5d2-5f8c-8974-c41864033314)

-- First, check if the duplicate has any meetings linked
DO $$
DECLARE
    duplicate_id UUID := '47b9f590-a5d2-5f8c-8974-c41864033314'::UUID;
    keep_id UUID := 'dd63f552-f773-5e1f-88fa-5c8276a74066'::UUID;
    meeting_count INTEGER;
BEGIN
    -- Check meetings
    SELECT COUNT(*) INTO meeting_count
    FROM meetings
    WHERE speaker_id = duplicate_id;
    
    IF meeting_count > 0 THEN
        -- Update meetings to use the kept speaker_id
        UPDATE meetings
        SET speaker_id = keep_id
        WHERE speaker_id = duplicate_id;
        
        RAISE NOTICE 'Updated % meetings to use kept speaker_id', meeting_count;
    END IF;
    
    -- Check meeting_requests (speaker_id is user_id UUID in this table, not bsl_speakers.id)
    -- So we don't need to update meeting_requests
    
    -- Delete the duplicate speaker record
    DELETE FROM bsl_speakers
    WHERE id = duplicate_id;
    
    RAISE NOTICE 'Deleted duplicate speaker record: %', duplicate_id;
END $$;

-- Add a unique constraint on user_id to prevent future duplicates
-- But allow NULL values (multiple speakers can have NULL user_id)
DO $$
BEGIN
    -- Create a unique partial index that only applies to non-NULL user_ids
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_bsl_speakers_user_id_unique' 
        AND tablename = 'bsl_speakers'
    ) THEN
        CREATE UNIQUE INDEX idx_bsl_speakers_user_id_unique 
        ON bsl_speakers(user_id) 
        WHERE user_id IS NOT NULL;
        
        RAISE NOTICE 'Created unique index on user_id (non-NULL values only)';
    END IF;
END $$;

COMMENT ON INDEX idx_bsl_speakers_user_id_unique IS 'Ensures each user_id can only have one speaker record, but allows multiple NULL user_ids';

