-- Add day_name column to event_agenda table
ALTER TABLE public.event_agenda 
ADD COLUMN IF NOT EXISTS day_name TEXT;

-- Add comment to explain the column purpose
COMMENT ON COLUMN public.event_agenda.day_name IS 'Thematic name for the day (e.g., "Regulación, Bancos Centrales e Infraestructura del Dinero Digital")';

-- Create index for better performance when filtering by day_name
CREATE INDEX IF NOT EXISTS idx_event_agenda_day_name ON public.event_agenda(day_name);
