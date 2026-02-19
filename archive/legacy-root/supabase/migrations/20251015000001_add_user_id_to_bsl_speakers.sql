-- Add user_id field to bsl_speakers table to link speakers to their user accounts
-- This enables generic speaker detection instead of hardcoded email checks

-- Add user_id column to BSL_Speakers table
ALTER TABLE public.bsl_speakers 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_bsl_speakers_user_id ON public.bsl_speakers(user_id);

-- Update RLS policies to work with the new user_id field
-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "speakers_select" ON public.bsl_speakers;

-- Create new policy that allows users to see all speakers but also allows speakers to see their own data
CREATE POLICY "speakers_select" ON public.bsl_speakers
FOR SELECT USING (
  -- Everyone can see all speakers (public data)
  true
);

-- Create policy for speakers to update their own data
CREATE POLICY "speakers_update_own" ON public.bsl_speakers
FOR UPDATE USING (
  -- Speakers can update their own speaker record
  user_id = auth.uid()
);

-- Create policy for speakers to insert their own data
CREATE POLICY "speakers_insert_own" ON public.bsl_speakers
FOR INSERT WITH CHECK (
  -- Speakers can insert their own speaker record
  user_id = auth.uid()
);

-- Update meeting_requests RLS policies to use the new user_id relationship
-- Drop existing policies
DROP POLICY IF EXISTS "Speakers can view requests to them" ON public.meeting_requests;
DROP POLICY IF EXISTS "Speakers can respond to requests" ON public.meeting_requests;

-- Create new policies that use the user_id relationship
CREATE POLICY "Speakers can view requests to them" ON public.meeting_requests
FOR SELECT USING (
  speaker_id IN (
    SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Speakers can respond to requests" ON public.meeting_requests
FOR UPDATE USING (
  speaker_id IN (
    SELECT id FROM public.bsl_speakers WHERE user_id = auth.uid()
  )
);

-- Add comment explaining the purpose
COMMENT ON COLUMN public.bsl_speakers.user_id IS 'Links speaker record to auth.users table for generic speaker detection';
