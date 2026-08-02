-- Older bootstrap-created passes defaulted pass_number to an empty string.
-- Repair those records so the pass UI can always present the holder with a
-- meaningful, stable ticket identifier.

BEGIN;

UPDATE public.passes
SET pass_number = 'BSL-' || upper(COALESCE(pass_type::text, 'general')) || '-'
  || substring(replace(id::text, '-', ''), 1, 8),
    updated_at = now()
WHERE NULLIF(btrim(COALESCE(pass_number, '')), '') IS NULL;

COMMIT;
