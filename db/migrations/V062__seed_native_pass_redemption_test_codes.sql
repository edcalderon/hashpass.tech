-- Public, reusable QA redemption campaigns for validating the native wallet.
-- Only SHA-256 hashes are stored; the corresponding values are exposed only
-- to authorized administrators in the Pass Codes panel.

BEGIN;

INSERT INTO public.pass_claim_codes (
  event_id, code_hash, label, pass_type, max_claims, is_active
) VALUES
  (
    'chile2026',
    encode(digest('GENERALCHILE2026', 'sha256'), 'hex'),
    'Native QA: Chile 2026 General',
    'general',
    NULL,
    true
  ),
  (
    'colombia2026',
    encode(digest('GENERALCOLOMBIA2026', 'sha256'), 'hex'),
    'Native QA: Colombia 2026 General',
    'general',
    NULL,
    true
  )
ON CONFLICT (code_hash) DO NOTHING;

COMMIT;
