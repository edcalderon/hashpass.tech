-- OAuth 2.1 authorization-server persistence for the Hashpass remote MCP.
-- Generated from Better Auth 1.7.6 with @better-auth/mcp 1.7.6, then adapted
-- to the existing PostgreSQL Better Auth tables and migration conventions.

CREATE TABLE IF NOT EXISTS public.jwks (
  id text PRIMARY KEY,
  "publicKey" text NOT NULL,
  "privateKey" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" timestamptz,
  alg text,
  crv text
);

CREATE TABLE IF NOT EXISTS public."oauthClient" (
  id text PRIMARY KEY,
  "clientId" text NOT NULL UNIQUE,
  "clientSecret" text,
  "clientDiscoveryId" text,
  disabled boolean DEFAULT false,
  "skipConsent" boolean,
  "enableEndSession" boolean,
  "subjectType" text,
  scopes jsonb,
  "clientCredentialsScopes" jsonb DEFAULT '[]'::jsonb,
  "userId" text REFERENCES public.ba_users(id) ON DELETE CASCADE,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  name text,
  uri text,
  icon text,
  contacts jsonb,
  tos text,
  policy text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" jsonb NOT NULL,
  "postLogoutRedirectUris" jsonb,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" boolean,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  jwks text,
  "jwksUri" text,
  "grantTypes" jsonb,
  "responseTypes" jsonb,
  "requirePKCE" boolean,
  "dpopBoundAccessTokens" boolean DEFAULT false,
  "referenceId" text,
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS "oauthClient_userId_idx" ON public."oauthClient"("userId");

CREATE TABLE IF NOT EXISTS public."oauthResource" (
  id text PRIMARY KEY,
  identifier text NOT NULL UNIQUE,
  name text NOT NULL,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" jsonb,
  "customClaims" jsonb,
  "dpopBoundAccessTokensRequired" boolean DEFAULT false,
  disabled boolean DEFAULT false,
  "createdAt" timestamptz,
  "updatedAt" timestamptz,
  "policyVersion" integer DEFAULT 1,
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS public."oauthClientResource" (
  id text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES public."oauthResource"(identifier) ON DELETE CASCADE,
  metadata jsonb,
  "createdAt" timestamptz,
  CONSTRAINT "oauthClientResource_clientId_resourceId_key" UNIQUE ("clientId", "resourceId")
);
CREATE INDEX IF NOT EXISTS "oauthClientResource_clientId_idx" ON public."oauthClientResource"("clientId");
CREATE INDEX IF NOT EXISTS "oauthClientResource_resourceId_idx" ON public."oauthClientResource"("resourceId");

CREATE TABLE IF NOT EXISTS public."oauthRefreshToken" (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE,
  "sessionId" text REFERENCES public.session(id) ON DELETE SET NULL,
  "userId" text NOT NULL REFERENCES public.ba_users(id) ON DELETE CASCADE,
  "referenceId" text,
  "authorizationCodeId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked timestamptz,
  "rotatedAt" timestamptz,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" timestamptz,
  "authTime" timestamptz,
  confirmation jsonb,
  scopes jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_clientId_idx" ON public."oauthRefreshToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_sessionId_idx" ON public."oauthRefreshToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_userId_idx" ON public."oauthRefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthRefreshToken_authorizationCodeId_idx" ON public."oauthRefreshToken"("authorizationCodeId");

CREATE TABLE IF NOT EXISTS public."oauthAccessToken" (
  id text PRIMARY KEY,
  token text NOT NULL UNIQUE,
  "clientId" text NOT NULL REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE,
  "sessionId" text REFERENCES public.session(id) ON DELETE SET NULL,
  "userId" text REFERENCES public.ba_users(id) ON DELETE CASCADE,
  "referenceId" text,
  "authorizationCodeId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  "refreshId" text REFERENCES public."oauthRefreshToken"(id) ON DELETE CASCADE,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked timestamptz,
  confirmation jsonb,
  scopes jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS "oauthAccessToken_clientId_idx" ON public."oauthAccessToken"("clientId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_sessionId_idx" ON public."oauthAccessToken"("sessionId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_userId_idx" ON public."oauthAccessToken"("userId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_authorizationCodeId_idx" ON public."oauthAccessToken"("authorizationCodeId");
CREATE INDEX IF NOT EXISTS "oauthAccessToken_refreshId_idx" ON public."oauthAccessToken"("refreshId");

CREATE TABLE IF NOT EXISTS public."oauthConsent" (
  id text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE,
  "userId" text REFERENCES public.ba_users(id) ON DELETE CASCADE,
  "referenceId" text,
  resources jsonb,
  "requestedUserInfoClaims" jsonb,
  scopes jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "oauthConsent_clientId_idx" ON public."oauthConsent"("clientId");
CREATE INDEX IF NOT EXISTS "oauthConsent_userId_idx" ON public."oauthConsent"("userId");

CREATE TABLE IF NOT EXISTS public."oauthClientAssertion" (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL
);

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'jwks', 'oauthClient', 'oauthResource', 'oauthClientResource',
    'oauthRefreshToken', 'oauthAccessToken', 'oauthConsent', 'oauthClientAssertion'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', target_table);
  END LOOP;
END $$;
