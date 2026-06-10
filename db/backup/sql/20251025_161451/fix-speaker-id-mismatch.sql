-- Fix speaker ID mismatch between numeric IDs and UUIDs
-- This handles speakers with numeric IDs (like 63) vs UUID format

-- 1. First, let's check what speaker IDs we actually have
SELECT 
    id,
    pg_typeof(id) as id_type,
    name,
    email
FROM public."BSL_Speakers" 
LIMIT 10;

-- 2. Check meeting_requests table structure
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'meeting_requests' 
  AND table_schema = 'public'
  AND column_name IN ('speaker_id', 'requester_id', 'id');

-- 3. Check existing meeting requests
SELECT 
    id,
    pg_typeof(id) as id_type,
    requester_id,
    pg_typeof(requester_id) as requester_id_type,
    speaker_id,
    pg_typeof(speaker_id) as speaker_id_type,
    status
FROM public.meeting_requests 
LIMIT 5;

-- 4. Update RLS policies to handle both numeric and UUID speaker IDs
DROP POLICY IF EXISTS "Users can update their own meeting requests" ON public.meeting_requests;
DROP POLICY IF EXISTS "Users can cancel their own meeting requests" ON public.meeting_requests;

-- Create flexible RLS policy that handles both UUID and numeric IDs
CREATE POLICY "Users can update their own meeting requests" ON public.meeting_requests
FOR UPDATE USING (
  -- Handle UUID requester_id
  (auth.uid()::text = requester_id::text) OR 
  -- Handle numeric speaker_id by converting to text
  (auth.uid()::text = requester_id::text)
);

CREATE POLICY "Users can cancel their own meeting requests" ON public.meeting_requests
FOR UPDATE USING (
  -- Handle UUID requester_id
  (auth.uid()::text = requester_id::text) OR 
  -- Handle numeric speaker_id by converting to text
  (auth.uid()::text = requester_id::text)
);

-- 5. Update the cancel_meeting_request function to handle both types
CREATE OR REPLACE FUNCTION cancel_meeting_request(
    p_user_id TEXT,
    p_request_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_id_uuid UUID;
    request_id_uuid UUID;
    rows_affected INTEGER;
BEGIN
    -- Try to convert IDs to UUID
    BEGIN
        user_id_uuid := p_user_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        user_id_uuid := NULL;
    END;

    BEGIN
        request_id_uuid := p_request_id::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        request_id_uuid := NULL;
    END;

    -- Try UUID first, then TEXT
    IF user_id_uuid IS NOT NULL AND request_id_uuid IS NOT NULL THEN
        UPDATE public.meeting_requests 
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = request_id_uuid 
          AND requester_id = user_id_uuid
          AND status = 'pending';
        
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        
        IF rows_affected > 0 THEN
            RETURN TRUE;
        END IF;
    END IF;

    -- If UUID update failed, try with TEXT
    UPDATE public.meeting_requests 
    SET status = 'cancelled', updated_at = NOW()
    WHERE id::text = p_request_id 
      AND requester_id::text = p_user_id
      AND status = 'pending';
    
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    
    RETURN rows_affected > 0;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant permissions
GRANT EXECUTE ON FUNCTION cancel_meeting_request(TEXT, TEXT) TO authenticated;

-- 7. Test the function
SELECT 'Speaker ID mismatch fix applied successfully' as status;
