-- Create event_agenda table for BSL2025 and future events
-- This table was being referenced but never created

CREATE TABLE IF NOT EXISTS public.event_agenda (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    event_id TEXT NOT NULL DEFAULT 'bsl2025',
    time TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    speakers TEXT[],
    type TEXT CHECK (type IN ('keynote', 'panel', 'workshop', 'networking', 'break')),
    location TEXT,
    day TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_agenda_event_id ON public.event_agenda(event_id);
CREATE INDEX IF NOT EXISTS idx_event_agenda_time ON public.event_agenda(time);
CREATE INDEX IF NOT EXISTS idx_event_agenda_day ON public.event_agenda(day);
CREATE INDEX IF NOT EXISTS idx_event_agenda_type ON public.event_agenda(type);

-- Enable RLS
ALTER TABLE public.event_agenda ENABLE ROW LEVEL SECURITY;

-- Create public read policy (event agenda is public information)
DROP POLICY IF EXISTS "Public read access" ON public.event_agenda;
CREATE POLICY "Public read access" 
    ON public.event_agenda 
    FOR SELECT 
    USING (true);

-- Allow service role to manage agenda
DROP POLICY IF EXISTS "Service role can manage agenda" ON public.event_agenda;
CREATE POLICY "Service role can manage agenda"
    ON public.event_agenda
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions
GRANT SELECT ON public.event_agenda TO anon, authenticated;
GRANT ALL ON public.event_agenda TO service_role;

-- Add comment
COMMENT ON TABLE public.event_agenda IS 'Event agenda/schedule for all events. Publicly readable.';
