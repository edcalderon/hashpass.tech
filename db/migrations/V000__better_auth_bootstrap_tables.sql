-- One-time bootstrap for a brand-new database: Better Auth's own tables
-- (user/account/session/verification) are normally created by Better Auth's
-- own schema push (@better-auth/cli / adapter auto-migrate), not by a file
-- in db/migrations -- that gap predates this session and was never captured
-- as a SQL migration. V005 in db/migrations then renames "user" -> ba_users.
-- Schema copied verbatim from live BSL prod (mnnqryrdlhddorqsrtbn), the only
-- place this schema is known to be correct, so a fresh dev bootstrap matches
-- production exactly.

CREATE TABLE IF NOT EXISTS public."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  "emailVerified" boolean NOT NULL,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT user_email_key UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON public.account("userId");

CREATE TABLE IF NOT EXISTS public.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  CONSTRAINT session_token_key UNIQUE (token)
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON public.session("userId");

CREATE TABLE IF NOT EXISTS public.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS verification_identifier_idx ON public.verification(identifier);

-- ============================================================================
-- Shared updated_at trigger helpers
-- ============================================================================
-- Referenced by later migrations (V002, V007, ...) but never themselves
-- defined in db/migrations -- confirmed present on live BSL prod
-- (mnnqryrdlhddorqsrtbn) via pg_get_functiondef, copied verbatim here so a
-- fresh database bootstrap doesn't hit "function does not exist".

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
