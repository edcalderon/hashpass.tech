BEGIN;

CREATE OR REPLACE FUNCTION public.marketing_pending_approvals(p_actor uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'key', c.key,
        'approval_requested_at', c.approval_requested_at,
        'approval_estimated_recipients', c.approval_estimated_recipients,
        'approval_snapshot', c.approval_snapshot
      ) ORDER BY c.approval_requested_at, c.created_at
    ),
    '[]'::jsonb
  )
  FROM public.marketing_campaigns c
  WHERE p_actor IS NOT NULL
    AND c.approval_status = 'pending'
    AND c.approval_requested_to = p_actor
    AND c.approval_snapshot IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.marketing_pending_approvals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_pending_approvals(uuid) TO service_role;

COMMIT;
