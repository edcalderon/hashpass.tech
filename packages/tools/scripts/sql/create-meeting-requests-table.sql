-- Create meeting_requests table
CREATE TABLE IF NOT EXISTS public.meeting_requests (
    id TEXT PRIMARY KEY DEFAULT 'MR-' || EXTRACT(EPOCH FROM NOW())::bigint || '-' || substr(md5(random()::text), 1, 8),
    requester_id TEXT NOT NULL,
    speaker_id TEXT NOT NULL,
    speaker_name TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_company TEXT,
    requester_title TEXT,
    requester_ticket_type TEXT CHECK (requester_ticket_type IN ('general', 'business', 'vip')),
    
    -- Meeting Details
    preferred_date TEXT,
    preferred_time TEXT,
    duration_minutes INTEGER DEFAULT 15,
    meeting_type TEXT CHECK (meeting_type IN ('networking', 'business', 'mentorship', 'collaboration')) DEFAULT 'networking',
    
    -- Request Content
    message TEXT DEFAULT '',
    note TEXT,
    boost_amount DECIMAL(10,2) DEFAULT 0,
    boost_transaction_hash TEXT,
    
    -- Status and Timing
    status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'completed', 'cancelled')) DEFAULT 'pending',
    priority_score INTEGER DEFAULT 50,
    
    -- Availability Window
    availability_window_start TIMESTAMP WITH TIME ZONE,
    availability_window_end TIMESTAMP WITH TIME ZONE,
    
    -- Response Details
    speaker_response TEXT,
    speaker_response_at TIMESTAMP WITH TIME ZONE,
    meeting_scheduled_at TIMESTAMP WITH TIME ZONE,
    meeting_location TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '3 days')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_meeting_requests_requester_id ON public.meeting_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_speaker_id ON public.meeting_requests(speaker_id);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_status ON public.meeting_requests(status);
CREATE INDEX IF NOT EXISTS idx_meeting_requests_created_at ON public.meeting_requests(created_at);

-- Enable Row Level Security
ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can view their own meeting requests
CREATE POLICY "Users can view own meeting requests" ON public.meeting_requests
    FOR SELECT USING (requester_id = auth.uid()::text);

-- Users can create meeting requests
CREATE POLICY "Users can create meeting requests" ON public.meeting_requests
    FOR INSERT WITH CHECK (requester_id = auth.uid()::text);

-- Users can update their own meeting requests (for status changes, etc.)
CREATE POLICY "Users can update own meeting requests" ON public.meeting_requests
    FOR UPDATE USING (requester_id = auth.uid()::text);

-- Speakers can view requests sent to them
CREATE POLICY "Speakers can view requests to them" ON public.meeting_requests
    FOR SELECT USING (speaker_id IN (
        SELECT id FROM public.BSL_Speakers WHERE user_id = auth.uid()::text
    ));

-- Speakers can update requests sent to them (for responses)
CREATE POLICY "Speakers can respond to requests" ON public.meeting_requests
    FOR UPDATE USING (speaker_id IN (
        SELECT id FROM public.BSL_Speakers WHERE user_id = auth.uid()::text
    ));

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meeting_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_meeting_requests_updated_at
    BEFORE UPDATE ON public.meeting_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_meeting_requests_updated_at();
