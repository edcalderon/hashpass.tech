-- Apply the support security hardening to databases where V097 was already
-- recorded before the support system was rolled out.
BEGIN;

-- Idempotency records are short-lived replay data. Rows created before the
-- visitor scope existed cannot safely be associated with a visitor, so remove
-- them before making the new identity boundary mandatory.
ALTER TABLE public.support_idempotency_keys
  ADD COLUMN IF NOT EXISTS visitor_id uuid;

DELETE FROM public.support_idempotency_keys
  WHERE visitor_id IS NULL;

ALTER TABLE public.support_idempotency_keys
  ALTER COLUMN visitor_id SET NOT NULL;

ALTER TABLE public.support_idempotency_keys
  DROP CONSTRAINT IF EXISTS support_idempotency_keys_pkey;

ALTER TABLE public.support_idempotency_keys
  ADD PRIMARY KEY (app_id, visitor_id, route, key);

-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. These RPCs are
-- SECURITY DEFINER and authorization is enforced by the API's service-role
-- client, so revoke public execution explicitly before the sole grant.
REVOKE ALL ON FUNCTION public.create_support_session(text, text, timestamptz, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_session(text, text, timestamptz, text, text, text, text, jsonb)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_support_ticket(text, uuid, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_support_ticket(text, uuid, text, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.send_support_message(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_support_message(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.set_ticket_status(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ticket_status(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.request_ticket_handoff(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_ticket_handoff(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_ticket_read(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ticket_read(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.list_support_events(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_events(uuid, uuid, text, integer) TO service_role;

REVOKE ALL ON FUNCTION public.list_support_tickets_for_visitor(uuid, text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_tickets_for_visitor(uuid, text, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.list_support_messages(uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_messages(uuid, uuid, uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.list_support_tickets_admin(text, text, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_support_tickets_admin(text, text, uuid, integer) TO service_role;

COMMIT;
