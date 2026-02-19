-- Comprehensive QR Code System
-- Supports dynamic QR generation, double-spend prevention, and admin controls
-- Future-proof for wallet crypto transfers

-- Create QR type enum (agnostic design for different QR use cases)
DO $$ BEGIN
    CREATE TYPE qr_type AS ENUM ('pass', 'wallet_transfer', 'access_code', 'ticket');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create QR status enum
DO $$ BEGIN
    CREATE TYPE qr_status AS ENUM ('active', 'used', 'expired', 'revoked', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create qr_codes table
CREATE TABLE IF NOT EXISTS public.qr_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE, -- Dynamic unique token for QR
    qr_type qr_type NOT NULL DEFAULT 'pass',
    
    -- Association (flexible for pass or wallet)
    pass_id TEXT REFERENCES public.passes(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Owner of the QR
    associated_entity_id TEXT, -- For future wallet addresses, etc.
    
    -- QR Data
    qr_data JSONB, -- Flexible JSON for QR payload
    display_data JSONB, -- Data to display when scanned
    
    -- Status and lifecycle
    status qr_status DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    used_at TIMESTAMPTZ,
    last_checked_at TIMESTAMPTZ,
    
    -- Usage tracking (prevent double spending)
    usage_count INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 1, -- Usually 1, but can allow multiple scans
    
    -- Admin controls
    admin_notes TEXT,
    revoked_by TEXT, -- Admin user ID who revoked
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    
    -- Security
    ip_address TEXT, -- IP when generated (optional)
    device_fingerprint TEXT, -- Device identifier (optional)
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON public.qr_codes(token);
CREATE INDEX IF NOT EXISTS idx_qr_codes_pass_id ON public.qr_codes(pass_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON public.qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_status ON public.qr_codes(status);
CREATE INDEX IF NOT EXISTS idx_qr_codes_qr_type ON public.qr_codes(qr_type);
CREATE INDEX IF NOT EXISTS idx_qr_codes_expires_at ON public.qr_codes(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON public.qr_codes(status, expires_at) WHERE status = 'active';

-- Create QR scan logs table (for audit trail)
CREATE TABLE IF NOT EXISTS public.qr_scan_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    qr_code_id UUID NOT NULL REFERENCES public.qr_codes(id) ON DELETE CASCADE,
    token TEXT NOT NULL, -- Denormalized for quick lookups
    
    -- Scanner info
    scanned_by_user_id TEXT, -- Who scanned it (admin/scanner)
    scanned_by_device_id TEXT, -- Device that scanned
    
    -- Scan result
    scan_status TEXT NOT NULL, -- 'valid', 'invalid', 'already_used', 'expired', 'revoked'
    scan_message TEXT,
    
    -- Location and context
    scan_location JSONB, -- GPS coordinates if available
    scan_ip_address TEXT,
    scan_user_agent TEXT,
    
    -- Timestamp
    scanned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_qr_code_id ON public.qr_scan_logs(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_token ON public.qr_scan_logs(token);
CREATE INDEX IF NOT EXISTS idx_qr_scan_logs_scanned_at ON public.qr_scan_logs(scanned_at);

-- Function to generate unique QR token
CREATE OR REPLACE FUNCTION generate_qr_token()
RETURNS TEXT AS $$
DECLARE
    v_token TEXT;
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate a unique token: type prefix + timestamp + random
        v_token := 'QR-' || 
                   EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
                   UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 12));
        
        -- Check if token exists (use v_token variable to avoid ambiguity with column name)
        SELECT EXISTS(SELECT 1 FROM public.qr_codes WHERE token = v_token) INTO exists_check;
        
        -- Exit loop if token is unique
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

-- Function to generate dynamic QR for a pass
CREATE OR REPLACE FUNCTION generate_pass_qr(
    p_pass_id TEXT,
    p_expires_in_minutes INTEGER DEFAULT 30,
    p_max_uses INTEGER DEFAULT 1
)
RETURNS UUID AS $$
DECLARE
    v_pass RECORD;
    v_qr_id UUID;
    v_token TEXT;
    v_qr_data JSONB;
BEGIN
    -- Get pass information
    SELECT * INTO v_pass
    FROM public.passes
    WHERE id = p_pass_id AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass not found or not active';
    END IF;
    
    -- Generate unique token
    v_token := generate_qr_token();
    
    -- Build QR data payload
    v_qr_data := jsonb_build_object(
        'type', 'pass',
        'pass_id', v_pass.id,
        'pass_number', v_pass.pass_number,
        'pass_type', v_pass.pass_type,
        'user_id', v_pass.user_id,
        'event_id', v_pass.event_id,
        'timestamp', EXTRACT(EPOCH FROM NOW())::bigint
    );
    
    -- Create QR code record
    INSERT INTO public.qr_codes (
        token,
        qr_type,
        pass_id,
        user_id,
        qr_data,
        display_data,
        status,
        expires_at,
        max_uses
    ) VALUES (
        v_token,
        'pass',
        v_pass.id,
        v_pass.user_id,
        v_qr_data,
        jsonb_build_object(
            'pass_number', v_pass.pass_number,
            'pass_type', v_pass.pass_type,
            'holder_name', 'User' -- Could join with users table if needed
        ),
        'active',
        NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL,
        p_max_uses
    ) RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate and use QR code (prevents double spending)
CREATE OR REPLACE FUNCTION validate_and_use_qr(
    p_token TEXT,
    p_scanner_user_id TEXT DEFAULT NULL,
    p_scanner_device_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_qr RECORD;
    v_result JSONB;
BEGIN
    -- Get QR code
    SELECT * INTO v_qr
    FROM public.qr_codes
    WHERE token = p_token;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'invalid',
            'message', 'QR code not found'
        );
    END IF;
    
    -- Check if already used
    IF v_qr.status = 'used' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'already_used', 'QR code has already been used'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'already_used',
            'message', 'This QR code has already been used',
            'used_at', v_qr.used_at,
            'usage_count', v_qr.usage_count
        );
    END IF;
    
    -- Check if revoked
    IF v_qr.status = 'revoked' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'revoked', COALESCE(v_qr.revoked_reason, 'QR code has been revoked')
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'revoked',
            'message', COALESCE(v_qr.revoked_reason, 'QR code has been revoked'),
            'revoked_at', v_qr.revoked_at
        );
    END IF;
    
    -- Check if suspended
    IF v_qr.status = 'suspended' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'suspended', 'QR code is suspended'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'suspended',
            'message', 'QR code is suspended'
        );
    END IF;
    
    -- Check if expired
    IF v_qr.expires_at IS NOT NULL AND v_qr.expires_at < NOW() THEN
        -- Auto-update status to expired
        UPDATE public.qr_codes
        SET status = 'expired', updated_at = NOW()
        WHERE id = v_qr.id;
        
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'expired', 'QR code has expired'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'expired',
            'message', 'QR code has expired',
            'expires_at', v_qr.expires_at
        );
    END IF;
    
    -- Check usage limit
    IF v_qr.usage_count >= v_qr.max_uses THEN
        UPDATE public.qr_codes
        SET status = 'used', updated_at = NOW()
        WHERE id = v_qr.id;
        
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'already_used', 'QR code usage limit reached'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'limit_reached',
            'message', 'QR code usage limit reached'
        );
    END IF;
    
    -- Valid QR - update usage
    UPDATE public.qr_codes
    SET 
        usage_count = usage_count + 1,
        used_at = CASE WHEN used_at IS NULL THEN NOW() ELSE used_at END,
        last_checked_at = NOW(),
        status = CASE WHEN usage_count + 1 >= max_uses THEN 'used' ELSE status END,
        updated_at = NOW()
    WHERE id = v_qr.id;
    
    -- Log successful scan
    INSERT INTO public.qr_scan_logs (
        qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
        scan_status, scan_message
    ) VALUES (
        v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
        'valid', 'QR code validated successfully'
    );
    
    -- Return success with QR data
    RETURN jsonb_build_object(
        'valid', true,
        'status', 'valid',
        'message', 'QR code is valid',
        'qr_data', v_qr.qr_data,
        'display_data', v_qr.display_data,
        'usage_count', v_qr.usage_count + 1,
        'max_uses', v_qr.max_uses
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admin to revoke QR code
CREATE OR REPLACE FUNCTION revoke_qr_code(
    p_token TEXT,
    p_admin_user_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'revoked',
        revoked_by = p_admin_user_id,
        revoked_at = NOW(),
        revoked_reason = p_reason,
        updated_at = NOW()
    WHERE token = p_token AND status = 'active'
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admin to suspend QR code
CREATE OR REPLACE FUNCTION suspend_qr_code(
    p_token TEXT,
    p_admin_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'suspended',
        updated_at = NOW()
    WHERE token = p_token AND status = 'active'
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for admin to reactivate QR code
CREATE OR REPLACE FUNCTION reactivate_qr_code(
    p_token TEXT,
    p_admin_user_id TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'active',
        revoked_by = NULL,
        revoked_at = NULL,
        revoked_reason = NULL,
        updated_at = NOW()
    WHERE token = p_token AND status IN ('revoked', 'suspended')
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own QR codes" ON public.qr_codes;
DROP POLICY IF EXISTS "Users can generate QR for their passes" ON public.qr_codes;
DROP POLICY IF EXISTS "Users can view their QR scan logs" ON public.qr_scan_logs;

-- Users can view their own QR codes
CREATE POLICY "Users can view their own QR codes" ON public.qr_codes
    FOR SELECT USING (user_id = auth.uid()::text);

-- Users can generate QR codes for their passes
CREATE POLICY "Users can generate QR for their passes" ON public.qr_codes
    FOR INSERT WITH CHECK (user_id = auth.uid()::text);

-- Users can view their own scan logs (limited)
CREATE POLICY "Users can view their QR scan logs" ON public.qr_scan_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.qr_codes 
            WHERE qr_codes.id = qr_scan_logs.qr_code_id 
            AND qr_codes.user_id = auth.uid()::text
        )
    );

-- Admin policies (assumes admin role check - adjust based on your admin system)
-- Note: You'll need to add admin role checks based on your auth system

-- Updated_at trigger
CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON public.qr_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE public.qr_codes IS 'Dynamic QR codes with double-spend prevention and admin controls';
COMMENT ON TABLE public.qr_scan_logs IS 'Audit trail for all QR code scans';
COMMENT ON FUNCTION generate_pass_qr IS 'Generates a dynamic QR code for a pass';
COMMENT ON FUNCTION validate_and_use_qr IS 'Validates QR code and prevents double spending';
COMMENT ON FUNCTION revoke_qr_code IS 'Admin function to revoke a QR code';
