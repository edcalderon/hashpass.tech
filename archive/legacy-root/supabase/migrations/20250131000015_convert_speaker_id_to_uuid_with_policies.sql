-- Convert meeting_requests.speaker_id to UUID (user_id) and update all policies
-- Step 1: Drop all policies that depend on speaker_id
DROP POLICY IF EXISTS "Speakers can view requests to them" ON public.meeting_requests;
DROP POLICY IF EXISTS "Speakers can respond to requests" ON public.meeting_requests;
DROP POLICY IF EXISTS "Users can view their own meeting requests" ON public.meeting_requests;
DROP POLICY IF EXISTS "Users can create meeting requests" ON public.meeting_requests;

-- Step 2: Drop the foreign key constraint
ALTER TABLE public.meeting_requests 
DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;

-- Step 3: Convert existing TEXT speaker_ids to UUID (user_id from bsl_speakers)
-- Only update records where we can find a matching user_id
UPDATE public.meeting_requests mr
SET speaker_id = bs.user_id::text
FROM public.bsl_speakers bs
WHERE mr.speaker_id::text = bs.id::text
AND bs.user_id IS NOT NULL;

-- Step 4: Delete orphaned records (where speaker doesn't have user_id)
DELETE FROM public.meeting_requests
WHERE speaker_id IS NOT NULL
AND NOT EXISTS (
    SELECT 1 FROM public.bsl_speakers bs
    WHERE bs.id::text = meeting_requests.speaker_id::text
    AND bs.user_id IS NOT NULL
);

-- Step 5: Change column type to UUID
ALTER TABLE public.meeting_requests 
ALTER COLUMN speaker_id TYPE UUID USING speaker_id::UUID;

-- Step 6: Recreate policies using UUID (user_id)
-- Users can view their own meeting requests
CREATE POLICY "Users can view their own meeting requests" ON public.meeting_requests
    FOR SELECT USING (auth.uid() = requester_id);

-- Users can create meeting requests
CREATE POLICY "Users can create meeting requests" ON public.meeting_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- Speakers can view requests to them (using user_id)
CREATE POLICY "Speakers can view requests to them" ON public.meeting_requests
    FOR SELECT USING (
        speaker_id = auth.uid()
    );

-- Speakers can respond to requests (using user_id)
CREATE POLICY "Speakers can respond to requests" ON public.meeting_requests
    FOR UPDATE USING (
        speaker_id = auth.uid()
    );

