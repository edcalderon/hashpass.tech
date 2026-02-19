-- Add updated_at column to bsl_speakers table
ALTER TABLE public.bsl_speakers 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create updated_at trigger for bsl_speakers
CREATE TRIGGER update_bsl_speakers_updated_at BEFORE UPDATE ON public.bsl_speakers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
