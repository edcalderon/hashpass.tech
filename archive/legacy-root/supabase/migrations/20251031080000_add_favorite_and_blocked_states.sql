-- Add favorite state for confirmed agenda events and improve blocked state for free slots
-- Add favorite column to track favorite status for any slot
ALTER TABLE public.user_agenda_status 
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;

-- Update status check constraint to ensure all states are supported
ALTER TABLE public.user_agenda_status 
DROP CONSTRAINT IF EXISTS user_agenda_status_status_check;

ALTER TABLE public.user_agenda_status 
ADD CONSTRAINT user_agenda_status_status_check 
CHECK (status IN ('unconfirmed', 'confirmed', 'available', 'interested', 'blocked', 'tentative'));

-- Add index for favorite status
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_is_favorite 
ON public.user_agenda_status(is_favorite) 
WHERE is_favorite = TRUE;

-- Update comment
COMMENT ON COLUMN public.user_agenda_status.is_favorite IS 'Marks a confirmed agenda event or meeting as favorite';
COMMENT ON COLUMN public.user_agenda_status.slot_status IS 'Status for free slots: available, interested, blocked, or tentative';

