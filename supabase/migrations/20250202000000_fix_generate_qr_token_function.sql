-- Fix generate_qr_token function - correct the table reference bug
-- The original function had "generate_qr_token.token" which PostgreSQL interpreted
-- as a table reference, but generate_qr_token is a function name, not a table.
-- This fixes it to use the variable "token" with a table alias to avoid ambiguity.

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
        
        -- Check if token exists (fixed: use v_token variable to avoid ambiguity with column name)
        SELECT EXISTS(SELECT 1 FROM public.qr_codes WHERE token = v_token) INTO exists_check;
        
        -- Exit loop if token is unique
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN v_token;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_qr_token IS 'Generates a unique QR token, ensuring it does not already exist in the qr_codes table';

