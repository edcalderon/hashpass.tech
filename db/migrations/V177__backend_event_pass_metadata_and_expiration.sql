-- Keep pass appearance and expiry on the event backend so every client uses
-- the same event dates, branding, and entitlement state.

BEGIN;

UPDATE public.events
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'walletPassStyle', 'event',
  'walletPassColor', '#00A9E0'
),
updated_at = now()
WHERE id IN ('peru2026', 'chile2026', 'colombia2026');

CREATE INDEX IF NOT EXISTS idx_passes_active_event_expiry
  ON public.passes (event_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.expire_ended_event_passes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.passes AS pass
  SET status = 'expired', updated_at = statement_timestamp()
  FROM public.events AS event
  WHERE pass.event_id = event.id
    AND pass.status = 'active'
    AND event.ends_at IS NOT NULL
    AND event.ends_at <= statement_timestamp();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ended_event_passes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ended_event_passes() TO service_role;

-- pg_cron runs the transition for every event even when no attendee opens the
-- app. The API also invokes the function before returning a pass list, so an
-- attendee opening Wallet at the end time sees the transition immediately.
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'hashpass-expire-ended-event-passes';

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'hashpass-expire-ended-event-passes',
    '* * * * *',
    'SELECT public.expire_ended_event_passes();'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
