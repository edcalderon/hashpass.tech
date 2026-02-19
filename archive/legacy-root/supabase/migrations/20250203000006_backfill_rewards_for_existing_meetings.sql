-- Backfill LUKAS rewards for all existing confirmed meetings
-- This gives 1 LUKAS to both speaker and requester for each confirmed meeting
-- Only rewards meetings that don't already have a reward transaction

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
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
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
        SELECT user_id INTO v_speaker_user_id
        FROM public.bsl_speakers
        WHERE id = v_meeting.speaker_id;
        
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
        IF EXISTS (
            SELECT 1 FROM public.reward_transactions
            WHERE user_id = v_speaker_user_id
            AND reference_id = v_meeting.id
            AND reference_type = 'meeting'
            AND source = 'meeting_accepted'
        ) THEN
            v_already_rewarded_count := v_already_rewarded_count + 1;
            CONTINUE;
        END IF;
        
        -- Reward speaker
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
                CONTINUE;
        END;
        
        -- Check if requester already has a reward for this meeting
        IF EXISTS (
            SELECT 1 FROM public.reward_transactions
            WHERE user_id = v_requester_user_id
            AND reference_id = v_meeting.id
            AND reference_type = 'meeting'
            AND source = 'meeting_accepted'
        ) THEN
            -- Speaker was rewarded but requester already has reward, continue
            v_processed_count := v_processed_count + 1;
            CONTINUE;
        END IF;
        
        -- Reward requester
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
                CONTINUE;
        END;
        
        v_processed_count := v_processed_count + 1;
    END LOOP;
    
    RETURN json_build_object(
        'success', true,
        'processed_meetings', v_processed_count,
        'already_rewarded', v_already_rewarded_count,
        'errors', v_error_count,
        'error_details', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the backfill
DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE 'Starting backfill of LUKAS rewards for existing confirmed meetings...';
    v_result := backfill_meeting_rewards();
    RAISE NOTICE 'Backfill completed: %', v_result;
END $$;

COMMENT ON FUNCTION backfill_meeting_rewards IS 'One-time function to backfill LUKAS rewards for all existing confirmed meetings. Rewards both speaker and requester with 1 LUKAS each. Skips meetings that already have rewards.';















