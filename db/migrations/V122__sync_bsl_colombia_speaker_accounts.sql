-- ============================================================================
-- V122: Sync the requested BSL speaker account records
-- ============================================================================
-- Keep the correction reproducible across BSL tenants. Rodrigo's development
-- profile remains unclaimed because that tenant has no matching confirmed
-- account; production keeps its existing r@ account link. Edward is linked by
-- the existing confirmed BSL auth email in each tenant.

BEGIN;

UPDATE public.bsl_speakers
SET is_active = true,
    is_accepting_meetings = true,
    directory_visible = true,
    updated_at = now()
WHERE slug = 'rodrigo-sainz'
  AND event_id IN ('colombia2026', 'bsl2025');

DO $$
DECLARE
  v_edward_user_id uuid;
BEGIN
  SELECT id
    INTO v_edward_user_id
    FROM auth.users
   WHERE lower(email) = 'edward@hashpass.app'
   ORDER BY created_at
   LIMIT 1;

  IF v_edward_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.bsl_speakers
     SET user_id = v_edward_user_id,
         is_active = true,
         is_accepting_meetings = true,
         directory_visible = true,
         metadata = COALESCE(metadata, '{}'::jsonb)
           || jsonb_build_object('email', 'edward@hashpass.app'),
         updated_at = now()
   WHERE slug = 'edward-calderon'
     AND event_id IN ('colombia2026', 'bsl2025');

  IF NOT EXISTS (
    SELECT 1
      FROM public.bsl_speakers
     WHERE slug = 'edward-calderon'
       AND event_id = 'colombia2026'
  ) THEN
    INSERT INTO public.bsl_speakers (
      event_id, slug, name, title, company, bio, user_id,
      is_active, is_accepting_meetings, directory_visible, metadata
    ) VALUES (
      'colombia2026', 'edward-calderon', 'Edward Calderón', 'Founder & CEO',
      'Hashpass', 'Founder of Hashpass and blockchain ecosystem builder.',
      v_edward_user_id, true, true, true,
      jsonb_build_object(
        'email', 'edward@hashpass.app',
        'source', 'manual-bsl-speaker-profile',
        'event_ids', jsonb_build_array('colombia2026')
      )
    );
  END IF;
END;
$$;

COMMIT;
