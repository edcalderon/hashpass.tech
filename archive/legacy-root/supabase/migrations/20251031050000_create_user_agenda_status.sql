-- Create user_agenda_status table to track user confirmations for agenda events
CREATE TABLE IF NOT EXISTS public.user_agenda_status (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agenda_id TEXT NOT NULL,
    event_id TEXT NOT NULL DEFAULT 'bsl2025',
    status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (status IN ('unconfirmed', 'confirmed')),
    confirmed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_agenda UNIQUE (user_id, agenda_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_user_id ON public.user_agenda_status(user_id);
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_agenda_id ON public.user_agenda_status(agenda_id);
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_status ON public.user_agenda_status(status);
CREATE INDEX IF NOT EXISTS idx_user_agenda_status_event_id ON public.user_agenda_status(event_id);

-- Enable RLS
ALTER TABLE public.user_agenda_status ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own agenda status
CREATE POLICY user_agenda_status_select ON public.user_agenda_status
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own agenda status
CREATE POLICY user_agenda_status_insert ON public.user_agenda_status
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own agenda status
CREATE POLICY user_agenda_status_update ON public.user_agenda_status
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_agenda_status_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER user_agenda_status_updated_at
    BEFORE UPDATE ON public.user_agenda_status
    FOR EACH ROW
    EXECUTE FUNCTION update_user_agenda_status_updated_at();

