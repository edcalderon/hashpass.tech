-- Event-specific brands allowed on the desktop authentication panel.
-- The API owns access control; RLS denies direct client table access.
BEGIN;

CREATE TABLE IF NOT EXISTS public.event_auth_allies (
  event_id text PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  allowed_ally_ids text[] NOT NULL DEFAULT ARRAY['hash-poker-room']::text[],
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_auth_allies_allowed_ids_nonempty
    CHECK (cardinality(allowed_ally_ids) >= 1),
  CONSTRAINT event_auth_allies_hash_poker_required
    CHECK ('hash-poker-room' = ANY(allowed_ally_ids))
);

ALTER TABLE public.event_auth_allies ENABLE ROW LEVEL SECURITY;

COMMIT;
