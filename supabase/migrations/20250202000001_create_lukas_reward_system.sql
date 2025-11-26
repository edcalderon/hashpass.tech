-- Create comprehensive LUKAS reward system
-- Tracks user balances and reward transactions

-- Create reward transaction type enum
DO $$ BEGIN
    CREATE TYPE reward_transaction_type AS ENUM ('reward', 'transfer', 'swap', 'redemption');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create reward source enum
DO $$ BEGIN
    CREATE TYPE reward_source AS ENUM ('meeting_accepted', 'event_attendance', 'referral', 'admin_grant', 'other');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create user_balances table to track LUKAS and other token balances
CREATE TABLE IF NOT EXISTS public.user_balances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token_symbol TEXT NOT NULL DEFAULT 'LUKAS',
    balance NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (balance >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token_symbol)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_balances_user_id ON public.user_balances(user_id);
CREATE INDEX IF NOT EXISTS idx_user_balances_token_symbol ON public.user_balances(token_symbol);
CREATE INDEX IF NOT EXISTS idx_user_balances_user_token ON public.user_balances(user_id, token_symbol);

-- Enable RLS
ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

-- Users can view their own balances
CREATE POLICY "Users can view their own balances" ON public.user_balances
    FOR SELECT USING (user_id = auth.uid());

-- Service role can manage all balances
CREATE POLICY "Service role can manage all balances" ON public.user_balances
    FOR ALL USING (auth.role() = 'service_role');

-- Create reward_transactions table to track all reward transactions
CREATE TABLE IF NOT EXISTS public.reward_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    token_symbol TEXT NOT NULL DEFAULT 'LUKAS',
    transaction_type reward_transaction_type NOT NULL,
    amount NUMERIC(20, 8) NOT NULL,
    balance_before NUMERIC(20, 8) NOT NULL,
    balance_after NUMERIC(20, 8) NOT NULL,
    source reward_source,
    reference_id UUID, -- Can reference meetings, events, etc.
    reference_type TEXT, -- 'meeting', 'event', 'referral', etc.
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for reward transactions
CREATE INDEX IF NOT EXISTS idx_reward_transactions_user_id ON public.reward_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_token_symbol ON public.reward_transactions(token_symbol);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_type ON public.reward_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_source ON public.reward_transactions(source);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_reference ON public.reward_transactions(reference_id, reference_type);
CREATE INDEX IF NOT EXISTS idx_reward_transactions_created_at ON public.reward_transactions(created_at DESC);

-- Enable RLS
ALTER TABLE public.reward_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own transactions
CREATE POLICY "Users can view their own transactions" ON public.reward_transactions
    FOR SELECT USING (user_id = auth.uid());

-- Service role can manage all transactions
CREATE POLICY "Service role can manage all transactions" ON public.reward_transactions
    FOR ALL USING (auth.role() = 'service_role');

-- Function to get or create user balance
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
    END IF;
    
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add reward to user balance
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
BEGIN
    -- Validate amount
    IF p_amount <= 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Amount must be greater than 0'
        );
    END IF;
    
    -- Get or create balance
    v_balance_before := get_or_create_user_balance(p_user_id, p_token_symbol);
    
    -- Calculate new balance
    v_balance_after := v_balance_before + p_amount;
    
    -- Update or insert balance
    INSERT INTO public.user_balances (user_id, token_symbol, balance, updated_at)
    VALUES (p_user_id, p_token_symbol, v_balance_after, NOW())
    ON CONFLICT (user_id, token_symbol)
    DO UPDATE SET
        balance = v_balance_after,
        updated_at = NOW();
    
    -- Create transaction record
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
    
    RETURN json_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'amount', p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reward users when meeting is accepted
CREATE OR REPLACE FUNCTION reward_meeting_accepted(
    p_meeting_id UUID,
    p_speaker_user_id UUID,
    p_requester_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_speaker_result JSONB;
    v_requester_result JSONB;
    v_meeting_record RECORD;
BEGIN
    -- Get meeting details
    SELECT * INTO v_meeting_record
    FROM public.meetings
    WHERE id = p_meeting_id;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;
    
    -- Reward speaker with 1 LUKAS
    v_speaker_result := add_reward(
        p_user_id := p_speaker_user_id,
        p_amount := 1.0,
        p_token_symbol := 'LUKAS',
        p_source := 'meeting_accepted',
        p_reference_id := p_meeting_id,
        p_reference_type := 'meeting',
        p_description := 'Reward for accepting and scheduling a meeting',
        p_metadata := json_build_object(
            'meeting_id', p_meeting_id,
            'role', 'speaker',
            'requester_id', p_requester_user_id
        )
    );
    
    -- Reward requester with 1 LUKAS
    v_requester_result := add_reward(
        p_user_id := p_requester_user_id,
        p_amount := 1.0,
        p_token_symbol := 'LUKAS',
        p_source := 'meeting_accepted',
        p_reference_id := p_meeting_id,
        p_reference_type := 'meeting',
        p_description := 'Reward for having your meeting request accepted and scheduled',
        p_metadata := json_build_object(
            'meeting_id', p_meeting_id,
            'role', 'requester',
            'speaker_id', p_speaker_user_id
        )
    );
    
    RETURN json_build_object(
        'success', true,
        'speaker_reward', v_speaker_result,
        'requester_reward', v_requester_result
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user balance
CREATE OR REPLACE FUNCTION get_user_balance(
    p_user_id UUID,
    p_token_symbol TEXT DEFAULT 'LUKAS'
)
RETURNS NUMERIC(20, 8) AS $$
DECLARE
    v_balance NUMERIC(20, 8);
BEGIN
    v_balance := get_or_create_user_balance(p_user_id, p_token_symbol);
    RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user transaction history
CREATE OR REPLACE FUNCTION get_user_transactions(
    p_user_id UUID,
    p_token_symbol TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    token_symbol TEXT,
    transaction_type reward_transaction_type,
    amount NUMERIC(20, 8),
    balance_after NUMERIC(20, 8),
    source reward_source,
    reference_id UUID,
    reference_type TEXT,
    description TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rt.id,
        rt.token_symbol,
        rt.transaction_type,
        rt.amount,
        rt.balance_after,
        rt.source,
        rt.reference_id,
        rt.reference_type,
        rt.description,
        rt.created_at
    FROM public.reward_transactions rt
    WHERE rt.user_id = p_user_id
    AND (p_token_symbol IS NULL OR rt.token_symbol = p_token_symbol)
    ORDER BY rt.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create updated_at trigger for user_balances
CREATE TRIGGER update_user_balances_updated_at 
    BEFORE UPDATE ON public.user_balances
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_or_create_user_balance(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_reward(UUID, NUMERIC, TEXT, reward_source, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION reward_meeting_accepted(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_balance(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_transactions(UUID, TEXT, INTEGER, INTEGER) TO authenticated;

-- Comments
COMMENT ON TABLE public.user_balances IS 'Tracks user balances for LUKAS and other tokens';
COMMENT ON TABLE public.reward_transactions IS 'Transaction history for all reward operations';
COMMENT ON FUNCTION reward_meeting_accepted IS 'Rewards both speaker and requester with 1 LUKAS when a meeting is accepted and scheduled';
COMMENT ON FUNCTION add_reward IS 'Adds reward to user balance and creates transaction record';
COMMENT ON FUNCTION get_user_balance IS 'Gets user balance for a specific token (defaults to LUKAS)';















