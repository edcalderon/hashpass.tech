-- 003_sync_log.sql
-- Auth sync log for audit trail

CREATE TABLE IF NOT EXISTS public.auth_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('supabase', 'directus', 'wallet')),
  event_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.auth_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own sync logs"
  ON public.auth_sync_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Service role can manage all sync logs"
  ON public.auth_sync_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_auth_sync_log_user_id ON public.auth_sync_log(user_id);
CREATE INDEX idx_auth_sync_log_source ON public.auth_sync_log(source);
CREATE INDEX idx_auth_sync_log_event_type ON public.auth_sync_log(event_type);
CREATE INDEX idx_auth_sync_log_created_at ON public.auth_sync_log(created_at);

-- Cleanup old sync logs (keep 90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_sync_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.auth_sync_log 
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
