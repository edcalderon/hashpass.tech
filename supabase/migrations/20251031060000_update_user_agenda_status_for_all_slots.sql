-- Update user_agenda_status table to handle all schedule slots (agenda events + meetings)
-- Add meeting_id column to track personal meetings
ALTER TABLE public.user_agenda_status 
ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE;

-- Update unique constraint to handle both agenda_id and meeting_id
ALTER TABLE public.user_agenda_status 
DROP CONSTRAINT IF EXISTS unique_user_agenda;

-- Create new unique constraint that allows one entry per user per agenda OR per meeting
-- Note: We'll use a partial unique index instead for better flexibility
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_agenda_event 
ON public.user_agenda_status(user_id, agenda_id) 
WHERE agenda_id IS NOT NULL AND meeting_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_user_meeting 
ON public.user_agenda_status(user_id, meeting_id) 
WHERE meeting_id IS NOT NULL AND agenda_id IS NULL;

-- Add index for meeting_id
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_meeting_id 
ON public.user_agenda_status(meeting_id);

-- Update comment to reflect new purpose
COMMENT ON TABLE public.user_agenda_status IS 'Tracks user confirmation status for all schedule slots (agenda events and personal meetings)';

