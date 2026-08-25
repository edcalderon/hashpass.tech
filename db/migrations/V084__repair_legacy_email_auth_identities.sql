-- Legacy imports created auth.users rows without the matching email identity
-- GoTrue expects for passwordless email authentication. Reconstruct only the
-- missing rows; existing provider identities remain authoritative.
INSERT INTO auth.identities (
  user_id,
  provider_id,
  provider,
  identity_data,
  created_at,
  updated_at,
  last_sign_in_at
)
SELECT
  user_row.id,
  user_row.id::text,
  'email',
  jsonb_build_object(
    'sub', user_row.id::text,
    'email', user_row.email,
    'email_verified', user_row.email_confirmed_at IS NOT NULL,
    'phone_verified', user_row.phone_confirmed_at IS NOT NULL
  ),
  user_row.created_at,
  now(),
  user_row.last_sign_in_at
FROM auth.users AS user_row
WHERE user_row.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.identities AS identity_row
    WHERE identity_row.user_id = user_row.id
      AND identity_row.provider = 'email'
  )
ON CONFLICT (provider_id, provider) DO NOTHING;
