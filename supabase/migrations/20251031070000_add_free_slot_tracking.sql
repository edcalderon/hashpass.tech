-- Add free slot tracking to user_agenda_status table
-- Allow tracking slots that don't have agenda_id or meeting_id (free slots)

-- Make agenda_id and meeting_id nullable to support free slots
ALTER TABLE public.user_agenda_status 
ALTER COLUMN agenda_id DROP NOT NULL;

-- Add slot_time column to identify free slots by date/time
ALTER TABLE public.user_agenda_status 
ADD COLUMN IF NOT EXISTS slot_time TIMESTAMPTZ;

-- Add slot_status to track different states for free slots (available, interested, blocked)
ALTER TABLE public.user_agenda_status 
ADD COLUMN IF NOT EXISTS slot_status TEXT DEFAULT 'available' CHECK (slot_status IN ('available', 'interested', 'blocked', 'tentative'));

-- Update status check constraint to include free slot states
ALTER TABLE public.user_agenda_status 
DROP CONSTRAINT IF EXISTS user_agenda_status_status_check;

ALTER TABLE public.user_agenda_status 
ADD CONSTRAINT user_agenda_status_status_check 
CHECK (status IN ('unconfirmed', 'confirmed', 'available', 'interested', 'blocked', 'tentative'));

-- Create unique index for free slots (by user and slot_time)
CREATE UNIQUE INDEX IF NOT EXISTS unique_user_free_slot 
ON public.user_agenda_status(user_id, slot_time) 
WHERE slot_time IS NOT NULL AND agenda_id IS NULL AND meeting_id IS NULL;

-- Add index for slot_time
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_slot_time 
ON public.user_agenda_status(slot_time);

-- Add index for slot_status
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_slot_status 
ON public.user_agenda_status(slot_status);

-- Update comment to reflect free slot tracking
COMMENT ON TABLE public.user_agenda_status IS 'Tracks user confirmation status for all schedule slots (agenda events, personal meetings, and free slots)';

