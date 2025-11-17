-- Fix balance updates and RLS policies
-- Ensure balances can be created and updated by the reward system
-- Fix any issues with the reward trigger and balance updates

-- Update RLS policies to allow service role and functions to manage balances
DROP POLICY IF EXISTS "Service role can manage all balances" ON public.user_balances;
CREATE POLICY "Service role can manage all balances" ON public.user_balances
    FOR ALL USING (auth.role() = 'service_role');

-- Allow authenticated users to INSERT their own balance (for initial creation)
DROP POLICY IF EXISTS "Users can insert their own balance" ON public.user_balances;
CREATE POLICY "Users can insert their own balance" ON public.user_balances
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Allow authenticated users to UPDATE their own balance
DROP POLICY IF EXISTS "Users can update their own balance" ON public.user_balances;
CREATE POLICY "Users can update their own balance" ON public.user_balances
    FOR UPDATE USING (user_id = auth.uid());

-- Ensure add_reward function has proper permissions and error handling
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
            -- Don't fail the whole operation if transaction record fails
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

-- Improve trigger function with better error handling
CREATE OR REPLACE FUNCTION trigger_reward_meeting_confirmed()
RETURNS TRIGGER AS $$
DECLARE
    speaker_user_id UUID;
    requester_user_id UUID;
    reward_result JSONB;
    v_error TEXT;
BEGIN
    -- Only process if meeting status is 'confirmed'
    IF NEW.status != 'confirmed' THEN
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
    
    -- Reward both users with 1 LUKAS each
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
            RAISE NOTICE 'Successfully rewarded users for meeting % (speaker: %, requester: %)', 
                NEW.id, speaker_user_id, requester_user_id;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            -- Log error but don't fail the transaction
            v_error := SQLERRM;
            RAISE WARNING 'Error rewarding users for meeting %: %', NEW.id, v_error;
    END;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure get_user_balance returns 0 if no balance exists (for UI display)
CREATE OR REPLACE FUNCTION get_user_balance(
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
    
    -- If no balance exists, return 0 (don't create it here, let add_reward create it)
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION add_reward IS 'Adds reward to user balance with improved error handling. Creates balance if it does not exist.';
COMMENT ON FUNCTION trigger_reward_meeting_confirmed IS 'Trigger function that automatically rewards both speaker and requester with 1 LUKAS each when a meeting is created with status confirmed. Includes improved error handling and logging.';














