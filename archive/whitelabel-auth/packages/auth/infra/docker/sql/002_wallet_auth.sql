-- 002_wallet_auth.sql
-- Wallet authentication tables

-- Wallet auth methods table (supports multiple wallets per user)
CREATE TABLE IF NOT EXISTS public.wallet_auth_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('ethereum', 'solana')),
  wallet_address TEXT NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  signature_nonce TEXT,
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_primary BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, wallet_type),
  UNIQUE(wallet_type, wallet_address)
);

-- Wallet auth challenges table
CREATE TABLE IF NOT EXISTS public.wallet_auth_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  wallet_type TEXT NOT NULL CHECK (wallet_type IN ('ethereum', 'solana')),
  nonce TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.wallet_auth_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_auth_challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for wallet_auth_methods
CREATE POLICY "Users can view own wallet methods"
  ON public.wallet_auth_methods FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all wallet methods"
  ON public.wallet_auth_methods FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for wallet_auth_challenges
CREATE POLICY "No direct access to challenges"
  ON public.wallet_auth_challenges FOR ALL
  USING (false);

CREATE POLICY "Service role can manage challenges"
  ON public.wallet_auth_challenges FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_wallet_auth_methods_user_id ON public.wallet_auth_methods(user_id);
CREATE INDEX idx_wallet_auth_methods_address ON public.wallet_auth_methods(wallet_address);
CREATE INDEX idx_wallet_challenges_address ON public.wallet_auth_challenges(wallet_address);
CREATE INDEX idx_wallet_challenges_expires ON public.wallet_auth_challenges(expires_at);

-- Function to update user wallet addresses in profile
CREATE OR REPLACE FUNCTION public.update_user_wallet_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.wallet_type = 'ethereum' THEN
    UPDATE public.user_profiles 
    SET eth_address = NEW.wallet_address 
    WHERE id = NEW.user_id;
  ELSIF NEW.wallet_type = 'solana' THEN
    UPDATE public.user_profiles 
    SET solana_address = NEW.wallet_address 
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_wallet_method_created
  AFTER INSERT ON public.wallet_auth_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_wallet_address();

-- Cleanup old challenges
CREATE OR REPLACE FUNCTION public.cleanup_expired_challenges()
RETURNS void AS $$
BEGIN
  DELETE FROM public.wallet_auth_challenges 
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;
