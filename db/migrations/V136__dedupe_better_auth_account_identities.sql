-- V136: make Better Auth OAuth identities one-to-one.
--
-- Older Better Auth adapters could insert the same provider/account pair more
-- than once. Better Auth resolves an OAuth account with a single-row query,
-- so those duplicates make the Google callback fail with
-- "Multiple accounts match the same accountId" and no session is issued.
-- Keep the most recently updated row for each identity so current token
-- material remains available, then enforce the invariant for future writes.

BEGIN;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.account
    GROUP BY "providerId", "accountId"
    HAVING count(DISTINCT "userId") > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot deduplicate Better Auth accounts: one provider/account identity belongs to multiple users';
  END IF;
END
$guard$;

WITH ranked_accounts AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY "providerId", "accountId"
      ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST, id DESC
    ) AS row_number
  FROM public.account
)
DELETE FROM public.account AS account_row
USING ranked_accounts
WHERE account_row.id = ranked_accounts.id
  AND ranked_accounts.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_id_key
  ON public.account ("providerId", "accountId");

COMMENT ON INDEX public.account_provider_account_id_key IS
  'A Better Auth provider account identity may belong to only one account row.';

COMMIT;
