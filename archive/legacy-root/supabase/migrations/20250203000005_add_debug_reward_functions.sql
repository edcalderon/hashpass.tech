-- Add debug/test functions to verify reward system is working
-- These can be used to test and debug balance updates

-- Function to manually test reward system
CREATE OR REPLACE FUNCTION test_reward_system(
    p_user_id UUID,
    p_amount NUMERIC(20, 8) DEFAULT 1.0
)
RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_balance_before NUMERIC(20, 8);
    v_balance_after NUMERIC(20, 8);
BEGIN
    -- Get current balance
    SELECT balance INTO v_balance_before
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = 'LUKAS';
    
    v_balance_before := COALESCE(v_balance_before, 0);
    
    -- Add reward
    v_result := add_reward(
        p_user_id := p_user_id,
        p_amount := p_amount,
        p_token_symbol := 'LUKAS',
        p_source := 'admin_grant',
        p_description := 'Test reward'
    );
    
    -- Get new balance
    SELECT balance INTO v_balance_after
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = 'LUKAS';
    
    v_balance_after := COALESCE(v_balance_after, 0);
    
    RETURN json_build_object(
        'success', (v_result->>'success')::boolean,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'expected_balance', v_balance_before + p_amount,
        'reward_result', v_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user balance status
CREATE OR REPLACE FUNCTION check_user_balance_status(
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_balance RECORD;
    v_transaction_count INTEGER;
BEGIN
    -- Get balance
    SELECT * INTO v_balance
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = 'LUKAS';
    
    -- Get transaction count
    SELECT COUNT(*) INTO v_transaction_count
    FROM public.reward_transactions
    WHERE user_id = p_user_id AND token_symbol = 'LUKAS';
    
    RETURN json_build_object(
        'user_id', p_user_id,
        'has_balance', v_balance IS NOT NULL,
        'balance', COALESCE(v_balance.balance, 0),
        'balance_created_at', v_balance.created_at,
        'balance_updated_at', v_balance.updated_at,
        'transaction_count', v_transaction_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION test_reward_system(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION check_user_balance_status(UUID) TO authenticated;

COMMENT ON FUNCTION test_reward_system IS 'Test function to manually add a reward and verify the balance updates correctly';
COMMENT ON FUNCTION check_user_balance_status IS 'Debug function to check if a user has a balance record and transaction history';















