-- Add trigger to automatically reward users when a meeting is confirmed
-- This separates reward logic from meeting acceptance for better performance and reliability
-- The trigger fires AFTER a meeting is inserted with status 'confirmed'

-- Function to handle meeting reward trigger
CREATE OR REPLACE FUNCTION trigger_reward_meeting_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    speaker_user_id UUID;
    requester_user_id UUID;
    reward_result JSONB;
BEGIN
    -- Only process if meeting status is 'confirmed'
    IF NEW.status != 'confirmed' THEN
        RETURN NEW;
    END IF;
    
    -- Get speaker's user_id from bsl_speakers
    SELECT user_id INTO speaker_user_id
    FROM public.bsl_speakers
    WHERE id = NEW.speaker_id;
    
    -- Get requester user_id (already UUID)
    requester_user_id := NEW.requester_id;
    
    -- Both user_ids must be valid
    IF speaker_user_id IS NULL OR requester_user_id IS NULL THEN
        RAISE WARNING 'Cannot reward meeting %: speaker_user_id=% requester_user_id=%', 
            NEW.id, speaker_user_id, requester_user_id;
        RETURN NEW;
    END IF;
    
    -- Reward both users with 1 LUKAS each
    -- Use a separate transaction context to avoid blocking the main transaction
    BEGIN
        reward_result := reward_meeting_accepted(
            p_meeting_id := NEW.id,
            p_speaker_user_id := speaker_user_id,
            p_requester_user_id := requester_user_id
        );
        
        -- Log reward result
        IF (reward_result->>'success')::boolean = false THEN
            RAISE WARNING 'Failed to reward users for meeting %: %', NEW.id, reward_result->>'error';
        ELSE
            RAISE NOTICE 'Successfully rewarded users for meeting %', NEW.id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail the transaction
            RAISE WARNING 'Error rewarding users for meeting %: %', NEW.id, SQLERRM;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on meetings table
DROP TRIGGER IF EXISTS trigger_reward_on_meeting_confirmed ON public.meetings;
CREATE TRIGGER trigger_reward_on_meeting_confirmed
    AFTER INSERT ON public.meetings
    FOR EACH ROW
    WHEN (NEW.status = 'confirmed')
    EXECUTE FUNCTION trigger_reward_meeting_confirmed();

COMMENT ON FUNCTION trigger_reward_meeting_confirmed IS 'Trigger function that automatically rewards both speaker and requester with 1 LUKAS each when a meeting is created with status confirmed. This runs after the meeting is inserted, ensuring the meeting exists before rewards are given.';
COMMENT ON TRIGGER trigger_reward_on_meeting_confirmed ON public.meetings IS 'Automatically triggers LUKAS rewards when a confirmed meeting is created. This separates reward logic from meeting acceptance for better performance.';

-- Enable realtime for user_balances table so subscriptions work
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_balances;

