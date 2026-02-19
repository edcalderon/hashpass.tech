-- Fix reward trigger to handle both INSERT and UPDATE
-- Add duplicate reward prevention
-- Ensure all existing confirmed meetings have rewards

-- Update trigger function to handle both INSERT and UPDATE
-- Also prevent duplicate rewards by checking if reward already exists
CREATE OR REPLACE FUNCTION trigger_reward_meeting_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    speaker_user_id UUID;
    requester_user_id UUID;
    reward_result JSONB;
    v_error TEXT;
    speaker_already_rewarded BOOLEAN := false;
    requester_already_rewarded BOOLEAN := false;
BEGIN
    -- Only process if meeting status is 'confirmed'
    IF NEW.status != 'confirmed' THEN
        RETURN NEW;
    END IF;
    
    -- For UPDATE: only process if status changed from something else to 'confirmed'
    IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' THEN
        -- Status was already confirmed, no need to reward again
        RETURN NEW;
    END IF;
    
    -- Get speaker's user_id from bsl_speakers
    BEGIN
        SELECT user_id INTO speaker_user_id
        FROM public.bsl_speakers
        WHERE id = NEW.speaker_id;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING 'Error getting speaker user_id for meeting %: %', NEW.id, SQLERRM;
            RETURN NEW;
    END;
    
    -- Get requester user_id (already UUID)
    requester_user_id := NEW.requester_id;
    
    -- Both user_ids must be valid
    IF speaker_user_id IS NULL THEN
        RAISE WARNING 'Cannot reward meeting %: speaker_user_id is NULL (speaker_id=%)', 
            NEW.id, NEW.speaker_id;
        RETURN NEW;
    END IF;
    
    IF requester_user_id IS NULL THEN
        RAISE WARNING 'Cannot reward meeting %: requester_user_id is NULL', NEW.id;
        RETURN NEW;
    END IF;
    
    -- Check if speaker already has a reward for this meeting
    SELECT EXISTS (
        SELECT 1 FROM public.reward_transactions
        WHERE user_id = speaker_user_id
        AND reference_id = NEW.id
        AND reference_type = 'meeting'
        AND source = 'meeting_accepted'
    ) INTO speaker_already_rewarded;
    
    -- Check if requester already has a reward for this meeting
    SELECT EXISTS (
        SELECT 1 FROM public.reward_transactions
        WHERE user_id = requester_user_id
        AND reference_id = NEW.id
        AND reference_type = 'meeting'
        AND source = 'meeting_accepted'
    ) INTO requester_already_rewarded;
    
    -- If both already rewarded, skip
    IF speaker_already_rewarded AND requester_already_rewarded THEN
        RAISE NOTICE 'Meeting % already has rewards for both users, skipping', NEW.id;
        RETURN NEW;
    END IF;
    
    -- Reward both users (reward_meeting_accepted handles both speaker and requester)
    -- It will check internally and only reward users who don't already have rewards
    -- But we need to handle partial rewards manually
    IF NOT speaker_already_rewarded AND NOT requester_already_rewarded THEN
        -- Both need rewards, use the standard function
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
                RAISE NOTICE 'Successfully rewarded both users for meeting % (speaker: %, requester: %)', 
                    NEW.id, speaker_user_id, requester_user_id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error := SQLERRM;
                RAISE WARNING 'Error rewarding users for meeting %: %', NEW.id, v_error;
        END;
    ELSIF NOT speaker_already_rewarded THEN
        -- Only speaker needs reward
        BEGIN
            reward_result := add_reward(
                p_user_id := speaker_user_id,
                p_amount := 1.0,
                p_token_symbol := 'LUKAS',
                p_source := 'meeting_accepted',
                p_reference_id := NEW.id,
                p_reference_type := 'meeting',
                p_description := 'Reward for accepting and scheduling a meeting',
                p_metadata := json_build_object(
                    'meeting_id', NEW.id,
                    'role', 'speaker',
                    'requester_id', requester_user_id
                )
            );
            
            IF (reward_result->>'success')::boolean = false THEN
                RAISE WARNING 'Failed to reward speaker for meeting %: %', NEW.id, reward_result->>'error';
            ELSE
                RAISE NOTICE 'Successfully rewarded speaker for meeting % (speaker: %)', 
                    NEW.id, speaker_user_id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error := SQLERRM;
                RAISE WARNING 'Error rewarding speaker for meeting %: %', NEW.id, v_error;
        END;
    ELSIF NOT requester_already_rewarded THEN
        -- Only requester needs reward
        BEGIN
            reward_result := add_reward(
                p_user_id := requester_user_id,
                p_amount := 1.0,
                p_token_symbol := 'LUKAS',
                p_source := 'meeting_accepted',
                p_reference_id := NEW.id,
                p_reference_type := 'meeting',
                p_description := 'Reward for having your meeting request accepted and scheduled',
                p_metadata := json_build_object(
                    'meeting_id', NEW.id,
                    'role', 'requester',
                    'speaker_id', speaker_user_id
                )
            );
            
            IF (reward_result->>'success')::boolean = false THEN
                RAISE WARNING 'Failed to reward requester for meeting %: %', NEW.id, reward_result->>'error';
            ELSE
                RAISE NOTICE 'Successfully rewarded requester for meeting % (requester: %)', 
                    NEW.id, requester_user_id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error := SQLERRM;
                RAISE WARNING 'Error rewarding requester for meeting %: %', NEW.id, v_error;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update trigger to handle both INSERT and UPDATE
DROP TRIGGER IF EXISTS trigger_reward_on_meeting_confirmed ON public.meetings;
CREATE TRIGGER trigger_reward_on_meeting_confirmed
    AFTER INSERT OR UPDATE ON public.meetings
    FOR EACH ROW
    WHEN (NEW.status = 'confirmed')
    EXECUTE FUNCTION trigger_reward_meeting_confirmed();

COMMENT ON FUNCTION trigger_reward_meeting_confirmed IS 'Trigger function that automatically rewards both speaker and requester with 1 LUKAS each when a meeting is created or updated with status confirmed. Prevents duplicate rewards by checking existing transactions.';
COMMENT ON TRIGGER trigger_reward_on_meeting_confirmed ON public.meetings IS 'Automatically triggers LUKAS rewards when a meeting is inserted or updated with status confirmed. Handles both new meetings and status changes.';

-- Update backfill function to be more robust and handle edge cases
CREATE OR REPLACE FUNCTION backfill_meeting_rewards()
RETURNS JSONB AS $$
DECLARE
    v_meeting RECORD;
    v_speaker_user_id UUID;
    v_requester_user_id UUID;
    v_speaker_result JSONB;
    v_requester_result JSONB;
    v_processed_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_already_rewarded_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    speaker_already_rewarded BOOLEAN;
    requester_already_rewarded BOOLEAN;
BEGIN
    RAISE NOTICE 'Starting backfill of LUKAS rewards for existing confirmed meetings...';
    
    -- Process all confirmed meetings
    FOR v_meeting IN 
        SELECT 
            m.id,
            m.speaker_id,
            m.requester_id,
            m.status,
            m.scheduled_at
        FROM public.meetings m
        WHERE m.status = 'confirmed'
        ORDER BY m.scheduled_at ASC
    LOOP
        -- Get speaker's user_id
        BEGIN
            SELECT user_id INTO v_speaker_user_id
            FROM public.bsl_speakers
            WHERE id = v_meeting.speaker_id;
        EXCEPTION
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                v_errors := array_append(v_errors, 
                    format('Meeting %s: Error getting speaker user_id - %s', v_meeting.id, SQLERRM));
                CONTINUE;
        END;
        
        -- Get requester user_id (already UUID)
        v_requester_user_id := v_meeting.requester_id;
        
        -- Skip if user_ids are invalid
        IF v_speaker_user_id IS NULL OR v_requester_user_id IS NULL THEN
            v_error_count := v_error_count + 1;
            v_errors := array_append(v_errors, 
                format('Meeting %s: Invalid user_ids (speaker: %s, requester: %s)', 
                    v_meeting.id, v_speaker_user_id, v_requester_user_id));
            CONTINUE;
        END IF;
        
        -- Check if speaker already has a reward for this meeting
        SELECT EXISTS (
            SELECT 1 FROM public.reward_transactions
            WHERE user_id = v_speaker_user_id
            AND reference_id = v_meeting.id
            AND reference_type = 'meeting'
            AND source = 'meeting_accepted'
        ) INTO speaker_already_rewarded;
        
        -- Check if requester already has a reward for this meeting
        SELECT EXISTS (
            SELECT 1 FROM public.reward_transactions
            WHERE user_id = v_requester_user_id
            AND reference_id = v_meeting.id
            AND reference_type = 'meeting'
            AND source = 'meeting_accepted'
        ) INTO requester_already_rewarded;
        
        -- If both already rewarded, skip
        IF speaker_already_rewarded AND requester_already_rewarded THEN
            v_already_rewarded_count := v_already_rewarded_count + 1;
            CONTINUE;
        END IF;
        
        -- Track if we successfully processed at least one reward
        v_processed_count := v_processed_count + 1;
        
        -- Reward speaker if not already rewarded
        IF NOT speaker_already_rewarded THEN
            BEGIN
                v_speaker_result := add_reward(
                    p_user_id := v_speaker_user_id,
                    p_amount := 1.0,
                    p_token_symbol := 'LUKAS',
                    p_source := 'meeting_accepted',
                    p_reference_id := v_meeting.id,
                    p_reference_type := 'meeting',
                    p_description := 'Backfill reward for confirmed meeting',
                    p_metadata := json_build_object(
                        'meeting_id', v_meeting.id,
                        'role', 'speaker',
                        'requester_id', v_requester_user_id,
                        'backfilled', true
                    )
                );
                
                IF (v_speaker_result->>'success')::boolean = false THEN
                    RAISE EXCEPTION 'Failed to reward speaker: %', v_speaker_result->>'error';
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    v_error_count := v_error_count + 1;
                    v_errors := array_append(v_errors, 
                        format('Meeting %s: Speaker reward failed - %s', v_meeting.id, SQLERRM));
                    -- Continue to try requester
            END;
        END IF;
        
        -- Reward requester if not already rewarded
        IF NOT requester_already_rewarded THEN
            BEGIN
                v_requester_result := add_reward(
                    p_user_id := v_requester_user_id,
                    p_amount := 1.0,
                    p_token_symbol := 'LUKAS',
                    p_source := 'meeting_accepted',
                    p_reference_id := v_meeting.id,
                    p_reference_type := 'meeting',
                    p_description := 'Backfill reward for confirmed meeting',
                    p_metadata := json_build_object(
                        'meeting_id', v_meeting.id,
                        'role', 'requester',
                        'speaker_id', v_speaker_user_id,
                        'backfilled', true
                    )
                );
                
                IF (v_requester_result->>'success')::boolean = false THEN
                    RAISE EXCEPTION 'Failed to reward requester: %', v_requester_result->>'error';
                END IF;
            EXCEPTION
                WHEN OTHERS THEN
                    v_error_count := v_error_count + 1;
                    v_errors := array_append(v_errors, 
                        format('Meeting %s: Requester reward failed - %s', v_meeting.id, SQLERRM));
                    -- Continue to next meeting
            END;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Backfill completed: processed=% already_rewarded=% errors=%', 
        v_processed_count, v_already_rewarded_count, v_error_count;
    
    RETURN json_build_object(
        'success', true,
        'processed_meetings', v_processed_count,
        'already_rewarded', v_already_rewarded_count,
        'errors', v_error_count,
        'error_details', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the backfill to ensure all existing confirmed meetings have rewards
DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE 'Starting backfill of LUKAS rewards for existing confirmed meetings...';
    v_result := backfill_meeting_rewards();
    RAISE NOTICE 'Backfill completed: %', v_result;
END $$;

COMMENT ON FUNCTION backfill_meeting_rewards IS 'One-time function to backfill LUKAS rewards for all existing confirmed meetings. Rewards both speaker and requester with 1 LUKAS each. Skips meetings that already have rewards. Can be run multiple times safely.';

