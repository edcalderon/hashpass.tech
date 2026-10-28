BEGIN;

CREATE OR REPLACE FUNCTION public.mission_control_metrics() RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', now()) - interval '6 days',
      date_trunc('day', now()),
      interval '1 day'
    ) AS day
  ), active_by_day AS (
    SELECT
      d.day,
      count(DISTINCT a.user_id)::integer AS users
    FROM days d
    LEFT JOIN public.marketing_activity a
      ON a.created_at >= d.day
     AND a.created_at < d.day + interval '1 day'
     AND a.source IN ('verified_server', 'observed_client')
    GROUP BY d.day
    ORDER BY d.day
  ), new_by_day AS (
    SELECT
      d.day,
      count(u.id)::integer AS users
    FROM days d
    LEFT JOIN public."user" u
      ON u.created_at >= d.day
     AND u.created_at < d.day + interval '1 day'
     AND u.deleted_at IS NULL
     AND u.status = 'active'
    GROUP BY d.day
    ORDER BY d.day
  )
  SELECT jsonb_build_object(
    'generatedAt', now(),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public."user" WHERE deleted_at IS NULL AND status = 'active'),
      'active30d', (
        SELECT count(DISTINCT user_id)
        FROM public.marketing_activity
        WHERE created_at >= now() - interval '30 days'
          AND source IN ('verified_server', 'observed_client')
      ),
      'new7d', (
        SELECT count(*) FROM public."user"
        WHERE deleted_at IS NULL
          AND status = 'active'
          AND created_at >= now() - interval '7 days'
      )
    ),
    'activity', jsonb_build_object(
      'verified30d', (
        SELECT count(*) FROM public.marketing_activity
        WHERE created_at >= now() - interval '30 days'
          AND source = 'verified_server'
      )
    ),
    'events', jsonb_build_object(
      'total', (SELECT count(*) FROM public.events),
      'published', (SELECT count(*) FROM public.events WHERE status = 'published')
    ),
    'passes', jsonb_build_object(
      'total', (SELECT count(*) FROM public.passes),
      'active', (SELECT count(*) FROM public.passes WHERE status::text = 'active')
    ),
    'meetings', jsonb_build_object(
      'total', (SELECT count(*) FROM public.meetings),
      'scheduled', (
        SELECT count(*) FROM public.meetings
        WHERE status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      )
    ),
    'trends', jsonb_build_object(
      'activeUsers7d', (SELECT jsonb_agg(users ORDER BY day) FROM active_by_day),
      'newUsers7d', (SELECT jsonb_agg(users ORDER BY day) FROM new_by_day)
    )
  );
$$;

REVOKE ALL ON FUNCTION public.mission_control_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mission_control_metrics() TO service_role;

COMMIT;
