-- Fix and update existing passes to have QR codes
-- This migration ensures the RPC function exists and creates QR codes for existing passes

-- Ensure the generate_pass_qr function exists (recreate if needed)
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
    v_user_id TEXT;
BEGIN
    -- Get pass information
    SELECT * INTO v_pass
    FROM public.passes
    WHERE id = p_pass_id AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass not found or not active: %', p_pass_id;
    END IF;
    
    -- Get user_id from pass
    v_user_id := v_pass.user_id;
    
    -- Generate unique token
    v_token := 'QR-' || 
               EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
               UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || p_pass_id) FROM 1 FOR 12));
    
    -- Ensure token is unique
    WHILE EXISTS(SELECT 1 FROM public.qr_codes WHERE token = v_token) LOOP
        v_token := 'QR-' || 
                   EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
                   UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || p_pass_id || v_token) FROM 1 FOR 12));
    END LOOP;
    
    -- Build QR data payload
    v_qr_data := jsonb_build_object(
        'type', 'pass',
        'pass_id', v_pass.id,
        'pass_number', v_pass.pass_number,
        'pass_type', v_pass.pass_type,
        'user_id', v_user_id,
        'event_id', COALESCE(v_pass.event_id, 'bsl2025'),
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
        v_user_id,
        v_qr_data,
        jsonb_build_object(
            'pass_number', v_pass.pass_number,
            'pass_type', v_pass.pass_type,
            'holder_name', 'User'
        ),
        'active',
        NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL,
        p_max_uses
    ) RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error generating QR code: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION generate_pass_qr(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION generate_pass_qr(TEXT, INTEGER, INTEGER) TO anon;

-- Function to update existing passes with QR codes
CREATE OR REPLACE FUNCTION update_existing_passes_with_qr()
RETURNS TABLE(pass_id TEXT, qr_created BOOLEAN, error_message TEXT) AS $$
DECLARE
    v_pass RECORD;
    v_qr_id UUID;
    v_error TEXT;
BEGIN
    -- Loop through all active passes that don't have QR codes
    FOR v_pass IN 
        SELECT p.id, p.pass_number, p.pass_type, p.user_id, p.event_id, p.status
        FROM public.passes p
        WHERE p.status = 'active'
        AND NOT EXISTS (
            SELECT 1 
            FROM public.qr_codes qr 
            WHERE qr.pass_id = p.id 
            AND qr.status = 'active'
            AND qr.expires_at > NOW()
        )
        ORDER BY p.created_at DESC
    LOOP
        BEGIN
            -- Generate QR code for this pass
            SELECT generate_pass_qr(v_pass.id, 30, 1) INTO v_qr_id;
            
            IF v_qr_id IS NOT NULL THEN
                pass_id := v_pass.id;
                qr_created := TRUE;
                error_message := NULL;
            ELSE
                pass_id := v_pass.id;
                qr_created := FALSE;
                error_message := 'QR generation returned NULL';
            END IF;
            
            RETURN NEXT;
            
        EXCEPTION WHEN OTHERS THEN
            pass_id := v_pass.id;
            qr_created := FALSE;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
    
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_existing_passes_with_qr() TO authenticated;
GRANT EXECUTE ON FUNCTION update_existing_passes_with_qr() TO service_role;

-- Comment
COMMENT ON FUNCTION generate_pass_qr IS 'Generates a dynamic QR code for a pass';
COMMENT ON FUNCTION update_existing_passes_with_qr IS 'Updates existing active passes to have QR codes';

