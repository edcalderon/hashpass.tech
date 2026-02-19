-- Verification and Fix Script for Critical RPC Functions
-- Run this on your target Supabase database
-- This script checks and creates missing RPC functions needed by the app

-- ============================================
-- 1. PASS SYSTEM FUNCTIONS
-- ============================================

-- Create default pass for new users
CREATE OR REPLACE FUNCTION create_default_pass(
    p_user_id UUID,
    p_pass_type TEXT DEFAULT 'general'
) RETURNS TEXT AS $$
DECLARE
    pass_id TEXT;
    v_max_requests INTEGER;
    v_max_boost INTEGER;
BEGIN
    -- Set limits based on pass type
    CASE p_pass_type
        WHEN 'vip' THEN
            v_max_requests := 100;
            v_max_boost := 1000;
        WHEN 'business' THEN
            v_max_requests := 50;
            v_max_boost := 500;
        ELSE -- 'general'
            v_max_requests := 10;
            v_max_boost := 100;
    END CASE;
    
    -- Create pass
    INSERT INTO passes (
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        max_boost_amount,
        used_meeting_requests,
        used_boost_amount,
        access_features,
        special_perks
    ) VALUES (
        p_user_id::TEXT,
        'bsl2025',
        p_pass_type,
        'active',
        'BSL2025-' || UPPER(p_pass_type) || '-' || EXTRACT(EPOCH FROM NOW())::bigint,
        v_max_requests,
        v_max_boost,
        0,
        0,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
            WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
            ELSE ARRAY['general_sessions']
        END,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
            WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
            ELSE ARRAY['basic_swag']
        END
    ) RETURNING id INTO pass_id;
    
    RETURN pass_id;
EXCEPTION
    WHEN unique_violation THEN
        -- Pass already exists for this user/event
        SELECT id INTO pass_id FROM passes 
        WHERE user_id = p_user_id::TEXT AND event_id = 'bsl2025' AND status = 'active'
        LIMIT 1;
        RETURN pass_id;
    WHEN OTHERS THEN
        RAISE NOTICE 'Error creating pass: %', SQLERRM;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get pass type limits
CREATE OR REPLACE FUNCTION get_pass_type_limits(p_pass_type TEXT)
RETURNS TABLE (
    max_requests INTEGER,
    max_boost INTEGER,
    daily_limit INTEGER,
    weekly_limit INTEGER,
    monthly_limit INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CASE p_pass_type
            WHEN 'vip' THEN 100
            WHEN 'business' THEN 50
            ELSE 10
        END as max_requests,
        CASE p_pass_type
            WHEN 'vip' THEN 1000
            WHEN 'business' THEN 500
            ELSE 100
        END as max_boost,
        CASE p_pass_type
            WHEN 'vip' THEN 20
            WHEN 'business' THEN 10
            ELSE 3
        END as daily_limit,
        CASE p_pass_type
            WHEN 'vip' THEN 100
            WHEN 'business' THEN 50
            ELSE 10
        END as weekly_limit,
        CASE p_pass_type
            WHEN 'vip' THEN 300
            WHEN 'business' THEN 150
            ELSE 30
        END as monthly_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get user meeting request counts
CREATE OR REPLACE FUNCTION get_user_meeting_request_counts(p_user_id UUID)
RETURNS TABLE (
    total_requests BIGINT,
    accepted_requests BIGINT,
    pending_requests BIGINT,
    declined_requests BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_requests,
        COUNT(*) FILTER (WHERE status = 'accepted')::BIGINT as accepted_requests,
        COUNT(*) FILTER (WHERE status = 'pending')::BIGINT as pending_requests,
        COUNT(*) FILTER (WHERE status = 'declined')::BIGINT as declined_requests
    FROM meeting_requests
    WHERE requester_id = p_user_id::TEXT;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================
-- 2. EMAIL TRACKING FUNCTIONS
-- ============================================

-- Check if email has been sent
CREATE OR REPLACE FUNCTION has_email_been_sent(
    p_user_id UUID,
    p_email_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sent BOOLEAN;
BEGIN
    -- Check if email has been sent
    SELECT EXISTS(
        SELECT 1 
        FROM user_email_tracking 
        WHERE user_id = p_user_id 
        AND email_type = p_email_type
    ) INTO v_sent;
    
    RETURN COALESCE(v_sent, FALSE);
EXCEPTION
    WHEN OTHERS THEN
        -- If table doesn't exist or other error, return false
        RETURN FALSE;
END;
$$;

-- Mark email as sent
CREATE OR REPLACE FUNCTION mark_email_as_sent(
    p_user_id UUID,
    p_email_type TEXT,
    p_locale TEXT DEFAULT 'en'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tracking_id UUID;
BEGIN
    INSERT INTO user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (p_user_id, p_email_type, p_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale
    RETURNING id INTO v_tracking_id;
    
    RETURN v_tracking_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error marking email as sent: %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Reset welcome email if not sent
CREATE OR REPLACE FUNCTION reset_welcome_email_if_not_sent(
    p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM user_email_tracking
    WHERE user_id = p_user_id 
    AND email_type = 'welcome';
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RETURN FALSE;
END;
$$;

-- ============================================
-- 3. OTP CLEANUP FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM otp_codes
    WHERE expires_at < NOW()
    OR (verified = TRUE AND created_at < NOW() - INTERVAL '1 day');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error cleaning up OTP codes: %', SQLERRM;
        RETURN 0;
END;
$$;

-- ============================================
-- 4. WALLET AUTH RATE LIMITING
-- ============================================

CREATE OR REPLACE FUNCTION check_wallet_auth_rate_limit(
    p_wallet_address TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    recent_attempts INTEGER;
BEGIN
    -- Count recent attempts (last 5 minutes)
    SELECT COUNT(*)::INTEGER INTO recent_attempts
    FROM wallet_auth_challenges
    WHERE wallet_address = p_wallet_address
    AND created_at > NOW() - INTERVAL '5 minutes';
    
    -- Allow max 10 attempts per 5 minutes
    RETURN recent_attempts < 10;
EXCEPTION
    WHEN OTHERS THEN
        -- If table doesn't exist, allow access
        RETURN TRUE;
END;
$$;

-- ============================================
-- 5. QR CODE MANAGEMENT FUNCTIONS
-- ============================================

-- Suspend QR code
CREATE OR REPLACE FUNCTION suspend_qr_code(
    p_qr_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE qr_codes
    SET 
        status = 'suspended',
        updated_at = NOW()
    WHERE id = p_qr_id;
    
    RETURN FOUND;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error suspending QR code: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- Reactivate QR code
CREATE OR REPLACE FUNCTION reactivate_qr_code(
    p_qr_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE qr_codes
    SET 
        status = 'active',
        updated_at = NOW()
    WHERE id = p_qr_id;
    
    RETURN FOUND;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error reactivating QR code: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- Revoke QR code
CREATE OR REPLACE FUNCTION revoke_qr_code(
    p_qr_id TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE qr_codes
    SET 
        status = 'revoked',
        updated_at = NOW()
    WHERE id = p_qr_id;
    
    RETURN FOUND;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error revoking QR code: %', SQLERRM;
        RETURN FALSE;
END;
$$;

-- ============================================
-- 6. MEETING SLOTS & BOOKINGS
-- ============================================

-- Handle booking status change
CREATE OR REPLACE FUNCTION handle_booking_status_change(
    booking_id TEXT,
    new_status TEXT,
    user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    booking_record RECORD;
    result JSON;
BEGIN
    -- Get booking details
    SELECT * INTO booking_record
    FROM meetings
    WHERE id = booking_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;
    
    -- Verify user has permission
    IF booking_record.host_id != user_id::TEXT 
       AND booking_record.attendee_id != user_id::TEXT THEN
        RAISE EXCEPTION 'Not authorized to modify this booking';
    END IF;
    
    -- Update booking status
    UPDATE meetings
    SET 
        status = new_status,
        updated_at = NOW()
    WHERE id = booking_id;
    
    -- Update associated slot if exists
    IF booking_record.slot_id IS NOT NULL THEN
        UPDATE meeting_slots
        SET 
            status = CASE new_status
                WHEN 'accepted' THEN 'booked'
                WHEN 'cancelled' THEN 'available'
                WHEN 'rejected' THEN 'available'
                ELSE status
            END,
            updated_at = NOW()
        WHERE id = booking_record.slot_id;
    END IF;
    
    -- Return updated booking
    SELECT row_to_json(m.*) INTO result
    FROM meetings m
    WHERE m.id = booking_id;
    
    RETURN result;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error handling booking status change: %', SQLERRM;
        RETURN NULL;
END;
$$;

-- ============================================
-- 7. FIX EVENT_AGENDA RLS POLICY
-- ============================================

-- Make event_agenda publicly readable (it's public event data)
DO $$ 
BEGIN
    -- Drop existing policies if any
    DROP POLICY IF EXISTS "Public read access" ON event_agenda;
    DROP POLICY IF EXISTS "Enable read access for all users" ON event_agenda;
    
    -- Enable RLS
    ALTER TABLE event_agenda ENABLE ROW LEVEL SECURITY;
    
    -- Create public read policy
    CREATE POLICY "Public read access" 
    ON event_agenda 
    FOR SELECT 
    USING (true);
    
    RAISE NOTICE 'Event agenda RLS policy created - public read access enabled';
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'event_agenda table does not exist yet';
    WHEN OTHERS THEN
        RAISE NOTICE 'Error setting up event_agenda RLS: %', SQLERRM;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify functions exist:
DO $$
DECLARE
    func_count INTEGER;
BEGIN
    SELECT COUNT(*)::INTEGER INTO func_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
    AND p.proname IN (
        'create_default_pass',
        'get_pass_type_limits',
        'has_email_been_sent',
        'mark_email_as_sent',
        'cleanup_expired_otp_codes',
        'check_wallet_auth_rate_limit',
        'suspend_qr_code',
        'reactivate_qr_code',
        'revoke_qr_code',
        'handle_booking_status_change'
    );
    
    RAISE NOTICE '✅ Found % critical RPC functions', func_count;
    
    IF func_count < 10 THEN
        RAISE WARNING '⚠️ Some functions may be missing. Expected 10 functions.';
    END IF;
END $$;
