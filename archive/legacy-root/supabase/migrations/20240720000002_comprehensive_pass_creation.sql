-- Comprehensive Pass Creation System
-- Ensures all dependencies exist for automatic pass creation

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

-- Create passes table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.passes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL DEFAULT 'bsl2025',
    pass_type pass_type DEFAULT 'general',
    status pass_status DEFAULT 'active',
    pass_number TEXT,
    max_meeting_requests INTEGER DEFAULT 5,
    used_meeting_requests INTEGER DEFAULT 0,
    max_boost_amount DECIMAL(10,2) DEFAULT 100.00,
    used_boost_amount DECIMAL(10,2) DEFAULT 0,
    access_features TEXT[] DEFAULT '{}',
    special_perks TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create pass_request_limits table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.pass_request_limits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pass_id TEXT NOT NULL REFERENCES public.passes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    remaining_meeting_requests INTEGER DEFAULT 5,
    remaining_boost_amount DECIMAL(10,2) DEFAULT 100.00,
    last_reset_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create get_pass_type_limits function
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type pass_type)
RETURNS TABLE (
    max_requests INTEGER,
    max_boost DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY SELECT 
        CASE 
            WHEN p_pass_type = 'vip' THEN 50
            WHEN p_pass_type = 'business' THEN 20
            ELSE 5
        END as max_requests,
        CASE 
            WHEN p_pass_type = 'vip' THEN 1000.00
            WHEN p_pass_type = 'business' THEN 500.00
            ELSE 100.00
        END as max_boost;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing create_default_pass function if it exists
DROP FUNCTION IF EXISTS public.create_default_pass;

-- Create comprehensive create_default_pass function
CREATE OR REPLACE FUNCTION public.create_default_pass(
    p_user_id UUID,
    p_pass_type TEXT DEFAULT 'general'
) RETURNS TEXT AS $$
DECLARE
    pass_id TEXT;
    limits RECORD;
    existing_pass_id TEXT;
    pass_type_enum pass_type;
BEGIN
    -- Safely cast the pass type to the enum type
    BEGIN
        pass_type_enum := p_pass_type::pass_type;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Invalid pass type: %. Defaulting to "general"', p_pass_type;
        pass_type_enum := 'general'::pass_type;
    END;
    
    -- Check if user already has a pass for this event
    SELECT id INTO existing_pass_id 
    FROM passes 
    WHERE user_id = p_user_id::text 
    AND event_id = 'bsl2025'
    LIMIT 1;
    
    -- If pass already exists, return the existing pass ID
    IF existing_pass_id IS NOT NULL THEN
        RETURN existing_pass_id;
    END IF;
    
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(pass_type_enum);
    
    -- Create pass
    INSERT INTO passes (
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        max_boost_amount,
        access_features,
        special_perks,
        created_at,
        updated_at
    ) VALUES (
        p_user_id::text,
        'bsl2025',
        pass_type_enum,
        'active',
        'BSL2025-' || pass_type_enum::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        COALESCE(limits.max_requests, 5),
        COALESCE(limits.max_boost, 0),
        CASE pass_type_enum
            WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
            WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
            ELSE ARRAY['general_sessions']
        END,
        CASE pass_type_enum
            WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
            WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
            ELSE ARRAY['basic_swag']
        END,
        NOW(),
        NOW()
    ) RETURNING id INTO pass_id;
    
    -- Initialize pass request limits
    INSERT INTO pass_request_limits (
        pass_id,
        user_id,
        remaining_meeting_requests,
        remaining_boost_amount,
        last_reset_at
    ) VALUES (
        pass_id,
        p_user_id,
        COALESCE(limits.max_requests, 5),
        COALESCE(limits.max_boost, 0),
        NOW()
    );
    
    RETURN pass_id;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error creating default pass: %', SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policies for passes table
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own passes" ON public.passes
    FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Users can insert their own passes" ON public.passes
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

CREATE POLICY IF NOT EXISTS "Users can update their own passes" ON public.passes
    FOR UPDATE USING (user_id = auth.uid()::text);

-- Add RLS policies for pass_request_limits table
ALTER TABLE public.pass_request_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their own pass limits" ON public.pass_request_limits
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "Users can update their own pass limits" ON public.pass_request_limits
    FOR UPDATE USING (user_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_passes_user_id ON public.passes(user_id);
CREATE INDEX IF NOT EXISTS idx_passes_event_id ON public.passes(event_id);
CREATE INDEX IF NOT EXISTS idx_passes_pass_type ON public.passes(pass_type);
CREATE INDEX IF NOT EXISTS idx_passes_status ON public.passes(status);

CREATE INDEX IF NOT EXISTS idx_pass_request_limits_user_id ON public.pass_request_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_pass_request_limits_pass_id ON public.pass_request_limits(pass_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at triggers
DROP TRIGGER IF EXISTS update_passes_updated_at ON public.passes;
CREATE TRIGGER update_passes_updated_at BEFORE UPDATE ON public.passes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_pass_request_limits_updated_at ON public.pass_request_limits;
CREATE TRIGGER update_pass_request_limits_updated_at BEFORE UPDATE ON public.pass_request_limits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment for the function
COMMENT ON FUNCTION public.create_default_pass IS 'Creates a default pass for a user with the specified type, initializing all necessary related records.';
COMMENT ON FUNCTION public.get_pass_type_limits IS 'Returns the request limits for a given pass type.';
