-- "Share my day" feature (My Schedule -> live shareable link + branded
-- image): each user gets one opaque, unguessable share_token per event they
-- have a schedule for. The token is the only thing embedded in the public
-- URL / API path -- it never exposes the real user id, and is safe to hand
-- out publicly since it grants read-only access to that user's own already
-- publicly-describable session attendance (titles/times/locations of
-- sessions on this event's own public agenda), nothing more sensitive.
CREATE TABLE IF NOT EXISTS public.user_schedule_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_user_schedule_shares_token ON public.user_schedule_shares (share_token);

ALTER TABLE public.user_schedule_shares ENABLE ROW LEVEL SECURITY;

-- No public SELECT policy: the public share page/API reads through the
-- service role (server-side route), resolving share_token -> user_id itself
-- rather than letting PostgREST/RLS expose this mapping table directly.
CREATE POLICY "user_schedule_shares_owner_select" ON public.user_schedule_shares
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_schedule_shares_owner_insert" ON public.user_schedule_shares
  FOR INSERT WITH CHECK (auth.uid() = user_id);
