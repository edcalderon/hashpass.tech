-- Fix reward system and backfill all user balances retroactively
-- This ensures all users get 1 LUKAS per confirmed meeting they participated in

-- First, ensure add_reward function has proper error handling and updates balances correctly
CREATE OR REPLACE FUNCTION add_reward(
    p_user_id UUID,
    p_amount NUMERIC(20, 8),
    p_token_symbol TEXT DEFAULT 'LUKAS',
    p_source reward_source DEFAULT 'other',
    p_reference_id UUID DEFAULT NULL,
    p_reference_type TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_balance_before NUMERIC(20, 8);
    v_balance_after NUMERIC(20, 8);
    v_transaction_id UUID;
    v_error TEXT;
BEGIN
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Amount must be greater than 0'
        );
    END IF;
    
    -- Validate user_id
    IF p_user_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'User ID is required'
        );
    END IF;
    
    -- Get or create balance
    BEGIN
        v_balance_before := get_or_create_user_balance(p_user_id, p_token_symbol);
    EXCEPTION
        WHEN OTHERS THEN
            v_error := SQLERRM;
            RAISE WARNING 'Error getting/creating balance for user %: %', p_user_id, v_error;
            RETURN json_build_object(
                'success', false,
                'error', 'Failed to get or create balance: ' || v_error
            );
    END;
    
    -- Calculate new balance
    v_balance_after := v_balance_before + p_amount;
    
    -- Update or insert balance with explicit error handling
    BEGIN
        INSERT INTO public.user_balances (user_id, token_symbol, balance, updated_at)
        VALUES (p_user_id, p_token_symbol, v_balance_after, NOW())
        ON CONFLICT (user_id, token_symbol)
        DO UPDATE SET
            balance = v_balance_after,
            updated_at = NOW();
    EXCEPTION
        WHEN OTHERS THEN
            v_error := SQLERRM;
            RAISE WARNING 'Error updating balance for user %: %', p_user_id, v_error;
            RETURN json_build_object(
                'success', false,
                'error', 'Failed to update balance: ' || v_error
            );
    END;
    
    -- Create transaction record
    BEGIN
        INSERT INTO public.reward_transactions (
            user_id,
            token_symbol,
            transaction_type,
            amount,
            balance_before,
            balance_after,
            source,
            reference_id,
            reference_type,
            description,
            metadata
        ) VALUES (
            p_user_id,
            p_token_symbol,
            'reward',
            p_amount,
            v_balance_before,
            v_balance_after,
            p_source,
            p_reference_id,
            p_reference_type,
            COALESCE(p_description, 'Reward: ' || p_amount || ' ' || p_token_symbol),
            p_metadata
        ) RETURNING id INTO v_transaction_id;
    EXCEPTION
        WHEN OTHERS THEN
            v_error := SQLERRM;
            RAISE WARNING 'Error creating transaction record for user %: %', p_user_id, v_error;
            -- Don't fail the whole operation if transaction record fails, but log it
    END;
    
    RETURN json_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'amount', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure get_or_create_user_balance works correctly
CREATE OR REPLACE FUNCTION get_or_create_user_balance(
    p_user_id UUID,
    p_token_symbol TEXT DEFAULT 'LUKAS'
)
RETURNS NUMERIC(20, 8) AS $$
DECLARE
    v_balance NUMERIC(20, 8);
BEGIN
    -- Try to get existing balance
    SELECT balance INTO v_balance
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = p_token_symbol;
    
    -- If no balance exists, create one with 0
    IF v_balance IS NULL THEN
        BEGIN
            INSERT INTO public.user_balances (user_id, token_symbol, balance)
            VALUES (p_user_id, p_token_symbol, 0)
            ON CONFLICT (user_id, token_symbol) DO NOTHING
            RETURNING balance INTO v_balance;
            
            -- If still null (conflict), get the existing one
            IF v_balance IS NULL THEN
                SELECT balance INTO v_balance
                FROM public.user_balances
                WHERE user_id = p_user_id AND token_symbol = p_token_symbol;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                -- If insert fails, try to get existing balance
                SELECT balance INTO v_balance
                FROM public.user_balances
                WHERE user_id = p_user_id AND token_symbol = p_token_symbol;
        END;
    END IF;
    
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix trigger to ensure it properly rewards users
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
    
    -- Reward speaker if not already rewarded
    IF NOT speaker_already_rewarded THEN
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
                RAISE NOTICE 'Successfully rewarded speaker for meeting % (speaker: %, balance: %)', 
                    NEW.id, speaker_user_id, reward_result->>'balance_after';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error := SQLERRM;
                RAISE WARNING 'Error rewarding speaker for meeting %: %', NEW.id, v_error;
        END;
    END IF;
    
    -- Reward requester if not already rewarded
    IF NOT requester_already_rewarded THEN
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
                RAISE NOTICE 'Successfully rewarded requester for meeting % (requester: %, balance: %)', 
                    NEW.id, requester_user_id, reward_result->>'balance_after';
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

-- Update trigger
DROP TRIGGER IF EXISTS trigger_reward_on_meeting_confirmed ON public.meetings;
CREATE TRIGGER trigger_reward_on_meeting_confirmed
    AFTER INSERT OR UPDATE ON public.meetings
    FOR EACH ROW
    WHEN (NEW.status = 'confirmed')
    EXECUTE FUNCTION trigger_reward_meeting_confirmed();

-- Comprehensive backfill function that processes ALL confirmed meetings
CREATE OR REPLACE FUNCTION backfill_all_meeting_rewards()
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
    v_speaker_rewarded INTEGER := 0;
    v_requester_rewarded INTEGER := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    speaker_already_rewarded BOOLEAN;
    requester_already_rewarded BOOLEAN;
BEGIN
    RAISE NOTICE 'Starting comprehensive backfill of LUKAS rewards for ALL confirmed meetings...';
    
    -- Process all confirmed meetings
    FOR v_meeting IN 
        SELECT 
            m.id,
            m.speaker_id,
            m.requester_id,
            m.status,
            m.scheduled_at,
            m.created_at
        FROM public.meetings m
        WHERE m.status = 'confirmed'
        ORDER BY m.created_at ASC, m.scheduled_at ASC
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
        
        -- Track that we're processing this meeting
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
                    p_description := 'Retroactive reward for confirmed meeting',
                    p_metadata := json_build_object(
                        'meeting_id', v_meeting.id,
                        'role', 'speaker',
                        'requester_id', v_requester_user_id,
                        'backfilled', true,
                        'backfill_date', NOW()
                    )
                );
                
                IF (v_speaker_result->>'success')::boolean = false THEN
                    RAISE EXCEPTION 'Failed to reward speaker: %', v_speaker_result->>'error';
                ELSE
                    v_speaker_rewarded := v_speaker_rewarded + 1;
                    RAISE NOTICE 'Rewarded speaker for meeting % (user: %, new balance: %)', 
                        v_meeting.id, v_speaker_user_id, v_speaker_result->>'balance_after';
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
                    p_description := 'Retroactive reward for confirmed meeting',
                    p_metadata := json_build_object(
                        'meeting_id', v_meeting.id,
                        'role', 'requester',
                        'speaker_id', v_speaker_user_id,
                        'backfilled', true,
                        'backfill_date', NOW()
                    )
                );
                
                IF (v_requester_result->>'success')::boolean = false THEN
                    RAISE EXCEPTION 'Failed to reward requester: %', v_requester_result->>'error';
                ELSE
                    v_requester_rewarded := v_requester_rewarded + 1;
                    RAISE NOTICE 'Rewarded requester for meeting % (user: %, new balance: %)', 
                        v_meeting.id, v_requester_user_id, v_requester_result->>'balance_after';
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
    
    RAISE NOTICE 'Backfill completed: processed=% meetings, speaker_rewarded=% users, requester_rewarded=% users, already_rewarded=% meetings, errors=%', 
        v_processed_count, v_speaker_rewarded, v_requester_rewarded, v_already_rewarded_count, v_error_count;
    
    RETURN json_build_object(
        'success', true,
        'processed_meetings', v_processed_count,
        'speaker_rewards_given', v_speaker_rewarded,
        'requester_rewards_given', v_requester_rewarded,
        'already_rewarded', v_already_rewarded_count,
        'errors', v_error_count,
        'error_details', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the comprehensive backfill
DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Starting comprehensive backfill of ALL user balances...';
    RAISE NOTICE 'This will reward 1 LUKAS per confirmed meeting to all users';
    RAISE NOTICE '========================================';
    
    v_result := backfill_all_meeting_rewards();
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Backfill Results:';
    RAISE NOTICE '  Processed Meetings: %', v_result->>'processed_meetings';
    RAISE NOTICE '  Speaker Rewards Given: %', v_result->>'speaker_rewards_given';
    RAISE NOTICE '  Requester Rewards Given: %', v_result->>'requester_rewards_given';
    RAISE NOTICE '  Already Rewarded: %', v_result->>'already_rewarded';
    RAISE NOTICE '  Errors: %', v_result->>'errors';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Full result: %', v_result;
END $$;

COMMENT ON FUNCTION add_reward IS 'Adds reward to user balance with comprehensive error handling. Ensures balance is properly updated in database.';
COMMENT ON FUNCTION trigger_reward_meeting_confirmed IS 'Trigger function that automatically rewards both speaker and requester with 1 LUKAS each when a meeting is created or updated with status confirmed. Includes comprehensive error handling and logging.';
COMMENT ON FUNCTION backfill_all_meeting_rewards IS 'Comprehensive backfill function that rewards all users with 1 LUKAS for each confirmed meeting they participated in. Can be run multiple times safely as it skips already rewarded meetings.';















