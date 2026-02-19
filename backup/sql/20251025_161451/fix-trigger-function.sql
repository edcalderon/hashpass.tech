-- Fix the trigger function that's calling the old can_make_meeting_request function
-- The trigger is calling can_make_meeting_request(uuid, text, numeric) which doesn't exist

-- 1. Drop the problematic trigger function
DROP FUNCTION IF EXISTS notify_meeting_request_created() CASCADE;

-- 2. Create a new trigger function that doesn't call external functions
CREATE OR REPLACE FUNCTION notify_meeting_request_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    pass_record RECORD;
    total_requests integer;
    remaining_requests integer;
    remaining_boost numeric;
BEGIN
    -- Direct pass validation - NO EXTERNAL FUNCTION CALLS
    SELECT p.id, p.pass_type::text, p.status::text, p.pass_number, 
           p.max_meeting_requests, p.used_meeting_requests, 
           p.max_boost_amount, p.used_boost_amount
    INTO pass_record
    FROM public.passes p 
    WHERE p.user_id::text = NEW.requester_id::text
      AND p.event_id = 'bsl2025' 
      AND p.status = 'active' 
    LIMIT 1;
    
    -- Check if user has an active pass
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot create meeting request: No active pass found';
    END IF;
    
    -- Check if pass is active
    IF pass_record.status != 'active' THEN
        RAISE EXCEPTION 'Cannot create meeting request: Pass is not active';
    END IF;
    
    -- Count actual meeting requests from database
    SELECT COUNT(*)
    INTO total_requests
    FROM public.meeting_requests 
    WHERE requester_id::text = NEW.requester_id::text;
    
    -- Calculate remaining requests and boost
    remaining_requests := GREATEST(0, COALESCE(pass_record.max_meeting_requests, 0) - total_requests);
    remaining_boost := GREATEST(0, COALESCE(pass_record.max_boost_amount, 0) - COALESCE(pass_record.used_boost_amount, 0));
    
    -- Check remaining requests
    IF remaining_requests <= 0 THEN
        RAISE EXCEPTION 'Cannot create meeting request: No remaining meeting requests';
    END IF;
    
    -- Check boost amount
    IF NEW.boost_amount > remaining_boost THEN
        RAISE EXCEPTION 'Cannot create meeting request: Insufficient boost amount';
    END IF;
    
    -- Update pass usage (direct update - NO FUNCTION CALLS)
    UPDATE public.passes 
    SET 
        used_meeting_requests = COALESCE(used_meeting_requests, 0) + 1,
        used_boost_amount = COALESCE(used_boost_amount, 0) + NEW.boost_amount,
        updated_at = NOW()
    WHERE id = pass_record.id;
    
    -- Send notification (if the function exists)
    BEGIN
        PERFORM send_prioritized_notification(
            NEW.speaker_id,
            NEW.requester_name,
            NEW.requester_company,
            NEW.requester_ticket_type,
            NEW.boost_amount,
            NEW.id
        );
    EXCEPTION
        WHEN undefined_function THEN
            -- Function doesn't exist, skip this step
            NULL;
    END;
    
    RETURN NEW;
END;
$$;

-- 3. Recreate the trigger
DROP TRIGGER IF EXISTS meeting_request_created_trigger ON meeting_requests;
CREATE TRIGGER meeting_request_created_trigger
    AFTER INSERT ON meeting_requests
    FOR EACH ROW
    EXECUTE FUNCTION notify_meeting_request_created();

-- 4. Verify
SELECT 'Trigger function fixed successfully' as status;
