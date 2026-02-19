-- Fix meeting_requests speaker_id foreign key constraint
-- Allow speaker_id to reference bsl_speakers instead of auth.users

-- First, drop all policies that depend on speaker_id
DROP POLICY IF EXISTS "Users can view their own meeting requests" ON meeting_requests;
DROP POLICY IF EXISTS "Speakers can update their meeting requests" ON meeting_requests;
DROP POLICY IF EXISTS "Users can create meeting requests" ON meeting_requests;

-- Drop the existing foreign key constraint
ALTER TABLE meeting_requests 
DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;

-- Change speaker_id to TEXT to match bsl_speakers.id format
ALTER TABLE meeting_requests 
ALTER COLUMN speaker_id TYPE TEXT;

-- Add a new foreign key constraint to reference bsl_speakers
ALTER TABLE meeting_requests 
ADD CONSTRAINT meeting_requests_speaker_id_fkey 
FOREIGN KEY (speaker_id) REFERENCES bsl_speakers(id) ON DELETE CASCADE;

-- Recreate policies that work with the new constraint
CREATE POLICY "Users can view their own meeting requests" ON meeting_requests
    FOR SELECT USING (auth.uid() = requester_id);

CREATE POLICY "Users can create meeting requests" ON meeting_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Note: We can't easily create a policy for speakers to update their requests
-- since speakers are not in auth.users. This would need to be handled differently
-- or speakers would need to be added to auth.users if they need to manage requests.
