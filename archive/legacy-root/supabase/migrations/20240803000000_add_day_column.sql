-- Add day column to event_agenda table
ALTER TABLE public.event_agenda 
ADD COLUMN IF NOT EXISTS day TEXT;
