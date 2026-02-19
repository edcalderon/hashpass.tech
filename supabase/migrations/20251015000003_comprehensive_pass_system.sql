-- Comprehensive Pass System for BSL 2025
-- Implements pass types, request limits, and business logic

-- Create pass types enum
DO $$ BEGIN
    CREATE TYPE pass_type AS ENUM ('general', 'business', 'vip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create pass status enum
DO $$ BEGIN
    CREATE TYPE pass_status AS ENUM ('active', 'used', 'expired', 'cancelled', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create subpass types enum for side events
DO $$ BEGIN
    CREATE TYPE subpass_type AS ENUM ('litter_smart', 'networking', 'workshop', 'exclusive');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Enhanced passes table - add new columns to existing table
ALTER TABLE public.passes 
ADD COLUMN IF NOT EXISTS pass_type pass_type DEFAULT 'general',
ADD COLUMN IF NOT EXISTS max_meeting_requests INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS used_meeting_requests INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_boost_amount DECIMAL(10,2) DEFAULT 100.00,
ADD COLUMN IF NOT EXISTS used_boost_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_perks TEXT[] DEFAULT '{}';

-- Update existing passes with default values based on pass_type
UPDATE public.passes 
SET 
    max_meeting_requests = CASE 
        WHEN pass_type = 'vip' THEN 50
        WHEN pass_type = 'business' THEN 20
        ELSE 5
    END,
    max_boost_amount = CASE 
        WHEN pass_type = 'vip' THEN 1000.00
        WHEN pass_type = 'business' THEN 500.00
        ELSE 100.00
    END
WHERE max_meeting_requests = 0 OR max_boost_amount = 0;

-- Subpasses table for side events
CREATE TABLE IF NOT EXISTS public.subpasses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pass_id TEXT NOT NULL REFERENCES public.passes(id) ON DELETE CASCADE,
    subpass_type subpass_type NOT NULL,
    event_name TEXT NOT NULL,
    status pass_status NOT NULL DEFAULT 'active',
    
    -- Subpass details
    access_code TEXT,
    venue TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_pass_subpass UNIQUE (pass_id, subpass_type, event_name)
);

-- User blocks table (speakers can block users)
CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    speaker_id TEXT NOT NULL REFERENCES public.bsl_speakers(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason TEXT,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_speaker_user_block UNIQUE (speaker_id, blocked_user_id)
);

-- Pass request limits tracking
CREATE TABLE IF NOT EXISTS public.pass_request_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pass_id TEXT NOT NULL REFERENCES public.passes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Daily limits
    daily_requests_sent INTEGER DEFAULT 0,
    daily_requests_date DATE DEFAULT CURRENT_DATE,
    
    -- Weekly limits
    weekly_requests_sent INTEGER DEFAULT 0,
    weekly_requests_week DATE DEFAULT DATE_TRUNC('week', CURRENT_DATE),
    
    -- Monthly limits
    monthly_requests_sent INTEGER DEFAULT 0,
    monthly_requests_month DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_pass_limits UNIQUE (pass_id, user_id)
);

-- Function to get pass type limits
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type pass_type)
RETURNS TABLE(
    max_requests INTEGER,
    max_boost DECIMAL,
    daily_limit INTEGER,
    weekly_limit INTEGER,
    monthly_limit INTEGER
) AS $$
BEGIN
    CASE p_pass_type
        WHEN 'vip' THEN
            RETURN QUERY SELECT 50, 1000.00, 10, 30, 50;
        WHEN 'business' THEN
            RETURN QUERY SELECT 20, 500.00, 5, 15, 20;
        WHEN 'general' THEN
            RETURN QUERY SELECT 5, 100.00, 2, 5, 5;
        ELSE
            RETURN QUERY SELECT 0, 0.00, 0, 0, 0;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can make meeting request
CREATE OR REPLACE FUNCTION can_make_meeting_request(
    p_user_id UUID,
    p_speaker_id TEXT,
    p_boost_amount DECIMAL DEFAULT 0
) RETURNS TABLE(
    can_request BOOLEAN,
    reason TEXT,
    pass_type pass_type,
    remaining_requests INTEGER,
    remaining_boost DECIMAL
) AS $$
DECLARE
    user_pass RECORD;
    limits RECORD;
    is_blocked BOOLEAN;
BEGIN
    -- Check if user is blocked by speaker
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO is_blocked;
    
    IF is_blocked THEN
        RETURN QUERY SELECT false, 'User is blocked by this speaker', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT false, 'No active pass found', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(user_pass.pass_type);
    
    -- Check if user has remaining requests
    IF user_pass.used_meeting_requests >= user_pass.max_meeting_requests THEN
        RETURN QUERY SELECT false, 'No remaining meeting requests', user_pass.pass_type, 0, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > 0 AND (user_pass.used_boost_amount + p_boost_amount) > user_pass.max_boost_amount THEN
        RETURN QUERY SELECT false, 'Insufficient boost amount available', user_pass.pass_type, user_pass.max_meeting_requests - user_pass.used_meeting_requests, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, 'Can make request', user_pass.pass_type, user_pass.max_meeting_requests - user_pass.used_meeting_requests, user_pass.max_boost_amount - user_pass.used_boost_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to update pass after meeting request
CREATE OR REPLACE FUNCTION update_pass_after_request(
    p_user_id UUID,
    p_boost_amount DECIMAL DEFAULT 0
) RETURNS BOOLEAN AS $$
DECLARE
    user_pass RECORD;
BEGIN
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass usage
    UPDATE passes 
    SET 
        used_meeting_requests = used_meeting_requests + 1,
        used_boost_amount = used_boost_amount + p_boost_amount,
        updated_at = NOW()
    WHERE id = user_pass.id;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to update pass after meeting response
CREATE OR REPLACE FUNCTION update_pass_after_response(
    p_user_id UUID,
    p_meeting_request_id UUID,
    p_status TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_pass RECORD;
    meeting_request RECORD;
BEGIN
    -- Get meeting request details
    SELECT * INTO meeting_request 
    FROM meeting_requests 
    WHERE id = p_meeting_request_id;
    
    IF meeting_request IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass based on response
    IF p_status = 'declined' THEN
        -- Refund the request and boost amount
        UPDATE passes 
        SET 
            used_meeting_requests = GREATEST(0, used_meeting_requests - 1),
            used_boost_amount = GREATEST(0, used_boost_amount - COALESCE(meeting_request.boost_amount, 0)),
            updated_at = NOW()
        WHERE id = user_pass.id;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_passes_user_event ON public.passes(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_passes_type_status ON public.passes(pass_type, status);
CREATE INDEX IF NOT EXISTS idx_subpasses_pass_type ON public.subpasses(pass_id, subpass_type);
CREATE INDEX IF NOT EXISTS idx_user_blocks_speaker ON public.user_blocks(speaker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_user ON public.user_blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_pass_request_limits_pass ON public.pass_request_limits(pass_id);

-- Enable RLS
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subpasses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pass_request_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for passes
DO $$ BEGIN
    CREATE POLICY "Users can view their own passes" ON public.passes
        FOR SELECT USING (auth.uid()::text = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can update their own passes" ON public.passes
        FOR UPDATE USING (auth.uid()::text = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "System can insert passes" ON public.passes
        FOR INSERT WITH CHECK (auth.uid()::text = user_id);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- RLS Policies for subpasses
CREATE POLICY "Users can view their own subpasses" ON public.subpasses
    FOR SELECT USING (EXISTS(
        SELECT 1 FROM passes WHERE id = subpasses.pass_id AND user_id = auth.uid()::text
    ));

-- RLS Policies for user_blocks
CREATE POLICY "Users can view blocks affecting them" ON public.user_blocks
    FOR SELECT USING (auth.uid() = blocked_user_id);

CREATE POLICY "Speakers can manage blocks" ON public.user_blocks
    FOR ALL USING (speaker_id IN (
        SELECT id FROM bsl_speakers WHERE id = speaker_id
    ));

-- RLS Policies for pass_request_limits
CREATE POLICY "Users can view their own limits" ON public.pass_request_limits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage limits" ON public.pass_request_limits
    FOR ALL USING (true);

-- Create updated_at triggers
DO $$ BEGIN
    CREATE TRIGGER update_passes_updated_at 
        BEFORE UPDATE ON public.passes
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_subpasses_updated_at 
        BEFORE UPDATE ON public.subpasses
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TRIGGER update_pass_request_limits_updated_at 
        BEFORE UPDATE ON public.pass_request_limits
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
