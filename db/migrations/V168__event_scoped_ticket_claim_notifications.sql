-- Preserve the event on ticket-claim review notifications so an administrator
-- can open the matching event queue directly from the inbox.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_id text;

CREATE INDEX IF NOT EXISTS notifications_event_created_at_idx
  ON public.notifications (event_id, created_at DESC)
  WHERE event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notify_ticket_claim_reviewers(p_claim_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_claim public.external_ticket_claims%ROWTYPE;
  v_email text;
  v_message text;
  v_ids uuid[];
  v_id uuid;
  v_notified uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_claim FROM public.external_ticket_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN v_notified; END IF;

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_claim.claimant_user_id;
  v_message := left(format(
    '%s requests a %s pass for %s with original ticket ••••%s (%s)%s.',
    coalesce(v_email, 'A member'),
    upper(v_claim.requested_pass_type),
    v_claim.event_id,
    v_claim.ticket_code_last4,
    v_claim.issuer,
    CASE WHEN nullif(v_claim.source_ticket_metadata ->> 'holder', '') IS NULL THEN ''
         ELSE ', name on ticket: ' || (v_claim.source_ticket_metadata ->> 'holder') END
  ), 500);

  SELECT coalesce(array_agg(DISTINCT reviewer.user_id), ARRAY[]::uuid[]) INTO v_ids
  FROM (
    SELECT er.user_id
    FROM public.event_roles er
    WHERE er.role = 'event_admin'::public.event_role
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (
        er.event_id = v_claim.event_id
        OR EXISTS (
          SELECT 1 FROM public.events target_event
          WHERE target_event.id = v_claim.event_id
            AND target_event.metadata ->> 'hubEventId' = er.event_id
        )
      )
    UNION
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) reviewer;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      INSERT INTO public.notifications (
        user_id, type, title, message, event_id, is_urgent, level
      ) VALUES (
        v_id, 'ticket_claim_review_required', 'HASHPASS pass approval request',
        v_message, v_claim.event_id, false, 'important'
      );
      v_notified := v_notified || v_id;
    EXCEPTION WHEN OTHERS THEN
      -- One unreachable reviewer must not hide the request from the others.
      RAISE WARNING 'ticket claim notification failed for %: %', v_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_ticket_claim_reviewers(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_ticket_claim_reviewers(uuid) TO service_role;

COMMIT;
