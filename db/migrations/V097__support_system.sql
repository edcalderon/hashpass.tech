-- HashPass Support system (Phase 2 backend for the widget/SDK contracts added
-- in the "support MVP foundations" PR). All access to these tables goes
-- through the Lambda API using the service-role client (same pattern as
-- meeting_requests, user_schedule_shares, etc.) -- visitors authenticate with
-- an opaque support-session bearer token, not a Supabase auth.uid(), so RLS
-- here is defense-in-depth only: tables are RLS-enabled with no public
-- policies, exactly like public.user_schedule_shares' "no public SELECT
-- policy: reads go through the service-role route" precedent (V058).
--
-- app_id is a plain text column, not a FK to a tenant table: this repo has no
-- tenant/application registry table (confirmed absent from db/migrations),
-- only a hostname-keyed config in packages/config/src/sso-config.ts. The
-- allow-list of known app ids is enforced in the API route layer
-- (apps/mobile-app/lib/server/support-apps.ts), matching the existing
-- event_id-as-text convention used throughout the meetings/agenda domain.

CREATE TABLE IF NOT EXISTS public.support_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL,
  external_id text,
  email text,
  name text,
  locale text,
  traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_visitors_app_external
  ON public.support_visitors (app_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_visitors_app_email
  ON public.support_visitors (app_id, email) WHERE email IS NOT NULL;

ALTER TABLE public.support_visitors ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id uuid NOT NULL REFERENCES public.support_visitors(id) ON DELETE CASCADE,
  app_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_sessions_token_hash
  ON public.support_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_support_sessions_visitor
  ON public.support_sessions (visitor_id);
CREATE INDEX IF NOT EXISTS idx_support_sessions_expires_at
  ON public.support_sessions (expires_at);

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id text NOT NULL,
  visitor_id uuid NOT NULL REFERENCES public.support_visitors(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  needs_human boolean NOT NULL DEFAULT false,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_visitor_updated
  ON public.support_tickets (visitor_id, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_app_status
  ON public.support_tickets (app_id, status, updated_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author text NOT NULL CHECK (author IN ('customer', 'ai', 'agent', 'system')),
  body text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created
  ON public.support_messages (ticket_id, created_at, id);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Per-visitor read cursor per ticket (not per-session: a visitor's read state
-- for a ticket must survive them getting a new session token later).
CREATE TABLE IF NOT EXISTS public.support_ticket_reads (
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  visitor_id uuid NOT NULL REFERENCES public.support_visitors(id) ON DELETE CASCADE,
  last_read_cursor text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, visitor_id)
);

ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

-- Idempotency-Key replay store, shared by all /v1/support/* mutating routes.
CREATE TABLE IF NOT EXISTS public.support_idempotency_keys (
  app_id text NOT NULL,
  route text NOT NULL,
  key text NOT NULL,
  response_status integer NOT NULL,
  response_body jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_id, route, key)
);

ALTER TABLE public.support_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Raw, HMAC-verified Kapso webhook deliveries. Persisted so no delivery is
-- lost while an outbound-processing worker is built in a later phase (see
-- docs/support/architecture.md); the unique idempotency_key constraint is
-- what makes redelivery safe to accept twice.
CREATE TABLE IF NOT EXISTS public.support_kapso_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_support_kapso_inbound_idempotency
  ON public.support_kapso_inbound_events (idempotency_key);

ALTER TABLE public.support_kapso_inbound_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RPCs. All SECURITY DEFINER and callable only by service_role (the Lambda
-- API's Supabase client) -- there is no legitimate PostgREST/anon/authenticated
-- caller for these: visitor identity is a support-session bearer token, not a
-- Supabase JWT, so anon/authenticated grants would create a bypass, not a
-- convenience.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_support_session(
  p_app_id text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_external_id text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_locale text DEFAULT NULL,
  p_traits jsonb DEFAULT NULL
)
RETURNS TABLE (session_id uuid, visitor_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := NULLIF(trim(COALESCE(p_app_id, '')), '');
  v_external_id text := NULLIF(trim(COALESCE(p_external_id, '')), '');
  v_email text := NULLIF(trim(COALESCE(p_email, '')), '');
  v_visitor_id uuid;
  v_session_id uuid := gen_random_uuid();
BEGIN
  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'A valid app id is required';
  END IF;

  IF v_external_id IS NOT NULL THEN
    SELECT id INTO v_visitor_id FROM public.support_visitors
      WHERE app_id = v_app_id AND external_id = v_external_id;
  ELSIF v_email IS NOT NULL THEN
    SELECT id INTO v_visitor_id FROM public.support_visitors
      WHERE app_id = v_app_id AND email = v_email;
  END IF;

  IF v_visitor_id IS NULL THEN
    INSERT INTO public.support_visitors (app_id, external_id, email, name, locale, traits)
    VALUES (v_app_id, v_external_id, v_email, NULLIF(p_name, ''), NULLIF(p_locale, ''), COALESCE(p_traits, '{}'::jsonb))
    RETURNING id INTO v_visitor_id;
  ELSE
    UPDATE public.support_visitors
    SET email = COALESCE(v_email, email),
        name = COALESCE(NULLIF(p_name, ''), name),
        locale = COALESCE(NULLIF(p_locale, ''), locale),
        traits = CASE WHEN p_traits IS NOT NULL THEN traits || p_traits ELSE traits END,
        updated_at = now()
    WHERE id = v_visitor_id;
  END IF;

  INSERT INTO public.support_sessions (id, visitor_id, app_id, token_hash, expires_at)
  VALUES (v_session_id, v_visitor_id, v_app_id, p_token_hash, p_expires_at);

  RETURN QUERY SELECT v_session_id, v_visitor_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_session(text, text, timestamptz, text, text, text, text, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_support_ticket(
  p_app_id text,
  p_visitor_id uuid,
  p_subject text,
  p_message text,
  p_priority text DEFAULT 'normal',
  p_context jsonb DEFAULT NULL
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ticket_id uuid := gen_random_uuid();
  v_subject text := NULLIF(trim(COALESCE(p_subject, '')), '');
  v_message text := NULLIF(trim(COALESCE(p_message, '')), '');
  v_priority text := COALESCE(NULLIF(p_priority, ''), 'normal');
BEGIN
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'A ticket subject is required';
  END IF;
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'An initial message is required';
  END IF;
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_visitors sv WHERE sv.id = p_visitor_id) THEN
    RAISE EXCEPTION 'Unknown visitor';
  END IF;

  INSERT INTO public.support_tickets (id, app_id, visitor_id, subject, priority, context)
  VALUES (v_ticket_id, p_app_id, p_visitor_id, v_subject, v_priority, p_context);

  INSERT INTO public.support_messages (ticket_id, author, body)
  VALUES (v_ticket_id, 'customer', v_message);

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = v_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, uuid, text, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.send_support_message(
  p_ticket_id uuid,
  p_visitor_id uuid,
  p_body text
)
RETURNS TABLE (id uuid, ticket_id uuid, author text, body text, delivery_status text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_message_id uuid := gen_random_uuid();
  v_body text := NULLIF(trim(COALESCE(p_body, '')), '');
BEGIN
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'A message body is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  INSERT INTO public.support_messages (id, ticket_id, author, body)
  VALUES (v_message_id, p_ticket_id, 'customer', v_body);

  UPDATE public.support_tickets st
  SET updated_at = now(),
      status = CASE WHEN st.status IN ('resolved', 'closed') THEN 'open' ELSE st.status END
  WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT m.id, m.ticket_id, m.author, m.body, m.delivery_status, m.created_at
  FROM public.support_messages m WHERE m.id = v_message_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_support_message(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_ticket_status(
  p_ticket_id uuid,
  p_visitor_id uuid,
  p_status text
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF p_status NOT IN ('open', 'resolved') THEN
    RAISE EXCEPTION 'Unsupported status transition';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  UPDATE public.support_tickets st SET status = p_status, updated_at = now() WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ticket_status(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.request_ticket_handoff(
  p_ticket_id uuid,
  p_visitor_id uuid
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  UPDATE public.support_tickets st
  SET needs_human = true,
      status = CASE WHEN st.status IN ('resolved', 'closed') THEN 'open' ELSE st.status END,
      priority = CASE WHEN st.priority IN ('low', 'normal') THEN 'high' ELSE st.priority END,
      updated_at = now()
  WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_ticket_handoff(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_ticket_read(
  p_ticket_id uuid,
  p_visitor_id uuid,
  p_cursor text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  INSERT INTO public.support_ticket_reads (ticket_id, visitor_id, last_read_cursor, updated_at)
  VALUES (p_ticket_id, p_visitor_id, p_cursor, now())
  ON CONFLICT (ticket_id, visitor_id)
  DO UPDATE SET last_read_cursor = EXCLUDED.last_read_cursor, updated_at = now();

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_ticket_read(uuid, uuid, text) TO service_role;

-- Derived, cursor-ordered event feed (message.created + ticket.updated) so we
-- don't need a separately-persisted events table for what's already fully
-- reconstructable from support_messages/support_tickets. agent.joined and
-- typing.* from the SDK's SupportEvent union are intentionally NOT emitted
-- here yet -- no realtime signal exists to source them from.
CREATE OR REPLACE FUNCTION public.list_support_events(
  p_ticket_id uuid,
  p_visitor_id uuid,
  p_cursor text DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (cursor text, event_type text, occurred_at timestamptz, payload jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT
      to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':' || m.id::text AS cursor,
      'message.created'::text AS event_type,
      m.created_at AS occurred_at,
      jsonb_build_object(
        'id', m.id, 'ticketId', m.ticket_id, 'author', m.author,
        'body', m.body, 'createdAt', m.created_at, 'deliveryStatus', m.delivery_status
      ) AS payload
    FROM public.support_messages m
    WHERE m.ticket_id = p_ticket_id

    UNION ALL

    SELECT
      to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':' || t.id::text AS cursor,
      'ticket.updated'::text AS event_type,
      t.updated_at AS occurred_at,
      jsonb_build_object(
        'id', t.id, 'subject', t.subject, 'status', t.status, 'priority', t.priority,
        'createdAt', t.created_at, 'updatedAt', t.updated_at
      ) AS payload
    FROM public.support_tickets t
    WHERE t.id = p_ticket_id
  )
  SELECT c.cursor, c.event_type, c.occurred_at, c.payload
  FROM combined c
  WHERE p_cursor IS NULL OR c.cursor > p_cursor
  ORDER BY c.cursor ASC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_support_events(uuid, uuid, text, integer) TO service_role;

-- Keyset-paginated reads (same fetch-limit+1/slice-in-route pattern as
-- admin/users+api.ts's admin_search_active_users RPC): the route asks for
-- p_limit+1 rows and uses the extra row only to decide whether a nextCursor
-- exists, then trims it before returning to the caller.

CREATE OR REPLACE FUNCTION public.list_support_tickets_for_visitor(
  p_visitor_id uuid,
  p_status text DEFAULT NULL,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cursor_updated_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF p_cursor IS NOT NULL THEN
    SELECT st.updated_at, st.id INTO v_cursor_updated_at, v_cursor_id
    FROM public.support_tickets st WHERE st.id = p_cursor AND st.visitor_id = p_visitor_id;
  END IF;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t
  WHERE t.visitor_id = p_visitor_id
    AND (p_status IS NULL OR t.status = p_status)
    AND (v_cursor_id IS NULL OR (t.updated_at, t.id) < (v_cursor_updated_at, v_cursor_id))
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_support_tickets_for_visitor(uuid, text, uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.list_support_messages(
  p_ticket_id uuid,
  p_visitor_id uuid,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 30
)
RETURNS TABLE (id uuid, ticket_id uuid, author text, body text, delivery_status text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF p_cursor IS NOT NULL THEN
    SELECT sm.created_at, sm.id INTO v_cursor_created_at, v_cursor_id
    FROM public.support_messages sm WHERE sm.id = p_cursor AND sm.ticket_id = p_ticket_id;
  END IF;

  RETURN QUERY
  SELECT m.id, m.ticket_id, m.author, m.body, m.delivery_status, m.created_at
  FROM public.support_messages m
  WHERE m.ticket_id = p_ticket_id
    AND (v_cursor_id IS NULL OR (m.created_at, m.id) > (v_cursor_created_at, v_cursor_id))
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_support_messages(uuid, uuid, uuid, integer) TO service_role;

-- Admin listing: intentionally a SEPARATE function from
-- list_support_tickets_for_visitor rather than that function with an
-- optional/nullable visitor filter -- collapsing them into one RPC would
-- make "list everything" one accidental NULL away from "list one visitor's
-- tickets" at every call site, customer-facing routes included.
CREATE OR REPLACE FUNCTION public.list_support_tickets_admin(
  p_app_id text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_cursor uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid, app_id text, visitor_id uuid, subject text, status text, priority text,
  needs_human boolean, context jsonb, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cursor_updated_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF p_cursor IS NOT NULL THEN
    SELECT st.updated_at, st.id INTO v_cursor_updated_at, v_cursor_id
    FROM public.support_tickets st WHERE st.id = p_cursor;
  END IF;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t
  WHERE (p_app_id IS NULL OR t.app_id = p_app_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (v_cursor_id IS NULL OR (t.updated_at, t.id) < (v_cursor_updated_at, v_cursor_id))
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_support_tickets_admin(text, text, uuid, integer) TO service_role;
