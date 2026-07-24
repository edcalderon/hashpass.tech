-- ============================================================================
-- V013: Let event-scoped admins read their event's passes
-- ============================================================================
-- passes_admin_all (V003) is is_admin()-gated, i.e. global admin only. An
-- event_admin granted only via event_roles (V012) currently gets zero rows
-- from a direct client-side `.from('passes')` read for their own event.
-- Moderators are intentionally excluded here (include_moderator=false) —
-- pass data includes PII (email, company) and the task's role decisions
-- scope moderators out of pass management; read access can be revisited
-- once that's explicitly decided.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS passes_event_admin_read ON public.passes;
CREATE POLICY passes_event_admin_read ON public.passes
  FOR SELECT
  USING (public.has_event_admin_access(auth.uid(), event_id, false));

COMMIT;
