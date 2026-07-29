-- PostgREST does not populate app.event_id. Make the public count RPC
-- explicitly event-scoped so an event route cannot read BSL's pass limits.

DROP FUNCTION IF EXISTS public.get_user_meeting_request_counts(text, text);
CREATE OR REPLACE FUNCTION public.get_user_meeting_request_counts(
  p_user_id text,
  p_event_id text
)
RETURNS TABLE (
  total_requests bigint,
  accepted_requests bigint,
  approved_requests bigint,
  pending_requests bigint,
  declined_requests bigint,
  cancelled_requests bigint,
  remaining_requests integer,
  remaining_boost numeric,
  max_requests integer,
  max_boost numeric,
  pass_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_pass RECORD;
  v_total bigint := 0;
  v_accepted bigint := 0;
  v_approved bigint := 0;
  v_pending bigint := 0;
  v_declined bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.max_boost_amount,
    p.used_meeting_requests,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint
  INTO v_total, v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id
    AND status NOT IN ('cancelled', 'expired');

  RETURN QUERY
  SELECT
    v_total,
    v_accepted,
    v_approved,
    v_pending,
    v_declined,
    v_cancelled,
    GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - v_total::int),
    GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)),
    COALESCE(v_pass.max_meeting_requests, 0),
    COALESCE(v_pass.max_boost_amount, 0),
    COALESCE(v_pass.pass_type, 'general');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_meeting_request_counts(text, text)
  TO authenticated;

-- The API rejects bad input first. This constraint keeps direct or future
-- integrations from creating inverted meeting intervals behind that boundary.
ALTER TABLE public.meeting_requests
  ADD CONSTRAINT meeting_requests_duration_minutes_supported_range
  CHECK (duration_minutes BETWEEN 5 AND 30) NOT VALID;
