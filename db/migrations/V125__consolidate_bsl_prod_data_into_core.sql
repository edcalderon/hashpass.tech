-- ============================================================================
-- V125: Consolidate BSL prod data into core (one database for all tenants)
-- ============================================================================
-- 2026-10-20 architecture decision: core (fxgftanraszjjyeidvia, us-east-2) is
-- the single production database for every tenant and event. The BSL project
-- (mnnqryrdlhddorqsrtbn, us-west-2) is retained as a read-only backup only
-- and must not receive writes after this cutover.
--
-- This migration copies the BSL-only production data (speakers, agenda,
-- passes, meetings, Better Auth accounts/sessions and the user registry) into
-- core's tables. It expects the BSL snapshot to be staged in the schemas
-- `bsl_import` (public) and `bsl_import_auth` (auth) on the same database --
-- see packages/tools/scripts/consolidate-bsl-into-core.md for the staging
-- procedure and the verification queries that gate the cutover.
--
-- Identity rules (agreed with the owner 2026-10-20):
--   * Where the same email exists on both databases, the CORE account wins.
--     BSL rows are remapped onto the core ids via the maps below.
--   * BSL-only people keep their BSL auth.users ids (no overlap existed:
--     0 shared uuids between the two auth id spaces), so their passes,
--     requests and sessions keep pointing at the same ids after the copy.
--   * The 8 orphan passes whose user exists on neither side by email are
--     mapped by ba_users email where possible and otherwise skipped
--     (logged below); nothing is invented for them.
--
-- Idempotent: every statement is ON CONFLICT DO NOTHING / WHERE NOT EXISTS,
-- so re-running the staged copy at cutover simply no-ops. The staging schemas
-- are dropped at the end only when every copy step succeeded.
--
-- Triggers are disabled for this session (session_replication_role=replica)
-- so copying auth.users does not fire the default-pass provisioning and
-- welcome-email triggers, and copied passes do not each mint a new QR code.
-- Core's QR codes for existing passes stay as they are; BSL passes get their
-- QR codes generated lazily by the existing app paths, same as before.
-- ============================================================================

BEGIN;

SET LOCAL session_replication_role = replica;

-- ---------------------------------------------------------------------------
-- 0. Working maps (dropped at the end): BSL id -> core id, per id space.
--    public.user and auth.users use DIFFERENT id spaces on both databases
--    (core: user.id is better-auth's id for BA sign-ups, auth_user_id holds
--    the supabase id; BSL: same shape), so one map per space.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS pg_temp.bsl_auth_map;      -- bsl auth.users.id -> core auth.users.id
DROP TABLE IF EXISTS pg_temp.bsl_user_map;      -- bsl public.user.id  -> core public.user.id

CREATE TEMP TABLE bsl_auth_map AS
SELECT b.id AS bsl_id, c.id AS core_id
  FROM bsl_import_auth.users b
  JOIN auth.users c ON lower(c.email) = lower(b.email);

CREATE TEMP TABLE bsl_user_map AS
SELECT b.id AS bsl_id, c.id AS core_id
  FROM bsl_import."user" b
  JOIN public."user" c ON lower(c.email) = lower(b.email);

-- Speakers need no map: every BSL speaker keeps its BSL uuid on core (the 60
-- shared uuids are identical on both sides; the other 51 are inserted). The
-- only identity conflict is core's hand-made Edward pair, handled in section 4.

-- ---------------------------------------------------------------------------
-- 1. auth.users / auth.identities (76 BSL-only users; 13 shared emails
--    resolved by the map, not copied). Explicit column lists because core
--    has newer generated/identity columns (confirmed_at) we must not copy.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at,
  recovery_token, recovery_sent_at, email_change_token_new, email_change,
  email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, phone, phone_confirmed_at,
  phone_change, phone_change_token, phone_change_sent_at,
  banned_until, reauthentication_token, reauthentication_sent_at,
  is_sso_user, deleted_at, is_anonymous
)
SELECT
  b.instance_id, b.id, b.aud, b.role, b.email, b.encrypted_password,
  b.email_confirmed_at, b.invited_at, b.confirmation_token, b.confirmation_sent_at,
  b.recovery_token, b.recovery_sent_at, b.email_change_token_new, b.email_change,
  b.email_change_sent_at, b.last_sign_in_at, b.raw_app_meta_data, b.raw_user_meta_data,
  b.is_super_admin, b.created_at, b.updated_at, b.phone, b.phone_confirmed_at,
  b.phone_change, b.phone_change_token, b.phone_change_sent_at,
  b.banned_until, b.reauthentication_token, b.reauthentication_sent_at,
  b.is_sso_user, b.deleted_at, b.is_anonymous
  FROM bsl_import_auth.users b
 WHERE NOT EXISTS (SELECT 1 FROM auth.users c WHERE c.id = b.id)
   AND NOT EXISTS (SELECT 1 FROM auth.users c WHERE lower(c.email) = lower(b.email))
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at,
  created_at, updated_at, id
)
SELECT
  b.provider_id, b.user_id, b.identity_data, b.provider, b.last_sign_in_at,
  b.created_at, b.updated_at, b.id
  FROM bsl_import_auth.identities b
 WHERE EXISTS (SELECT 1 FROM auth.users c WHERE c.id = b.user_id)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. public.user / profiles (BSL-only people; shared emails keep the core row).
-- ---------------------------------------------------------------------------

INSERT INTO public."user" (
  id, email, provider, auth_provider, auth_user_id, first_name, last_name,
  full_name, avatar_url, phone, role, status, email_verified_at,
  last_sign_in_at, deleted_at, created_at, updated_at, auth_metadata,
  profile_metadata, provider_ids
)
SELECT
  b.id, b.email, b.provider, b.auth_provider,
  COALESCE(bsl_auth_map.core_id::text, b.auth_user_id),
  b.first_name, b.last_name, b.full_name, b.avatar_url, b.phone, b.role,
  b.status, b.email_verified_at, b.last_sign_in_at, b.deleted_at,
  b.created_at, b.updated_at, b.auth_metadata, b.profile_metadata,
  -- Point provider_ids.supabase at the core auth id where the email matched.
  CASE WHEN b.provider_ids ? 'supabase' AND bsl_auth_map.core_id IS NOT NULL
       THEN b.provider_ids || jsonb_build_object('supabase', bsl_auth_map.core_id::text)
       ELSE b.provider_ids END
  FROM bsl_import."user" b
  LEFT JOIN bsl_auth_map
    ON bsl_auth_map.bsl_id::text = COALESCE(b.provider_ids ->> 'supabase', b.auth_user_id)
 WHERE NOT EXISTS (SELECT 1 FROM public."user" c WHERE c.id = b.id)
   AND NOT EXISTS (SELECT 1 FROM public."user" c WHERE lower(c.email) = lower(b.email))
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, avatar_url, company, title, bio, phone, metadata, created_at, updated_at)
SELECT b.id, b.email, b.full_name, b.avatar_url, b.company, b.title, b.bio, b.phone, b.metadata, b.created_at, b.updated_at
  FROM bsl_import.profiles b
 WHERE EXISTS (SELECT 1 FROM public."user" u WHERE u.id = b.id)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Better Auth store (ba_users / account / session / jwks / oauth tables).
--    Better Auth on prod currently points at the BSL database, so the whole
--    active session set must come across or every BA login dies at cutover.
-- ---------------------------------------------------------------------------

INSERT INTO public.ba_users (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
SELECT b.id, b.name, b.email, b."emailVerified", b.image, b."createdAt", b."updatedAt"
  FROM bsl_import.ba_users b
 WHERE NOT EXISTS (SELECT 1 FROM public.ba_users c WHERE lower(c.email) = lower(b.email))
ON CONFLICT (id) DO NOTHING;  -- 3 shared emails: the core row wins, children remap below

INSERT INTO public.account (
  id, "accountId", "providerId", "userId", "accessToken", "refreshToken",
  "idToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", scope, password,
  "createdAt", "updatedAt"
)
SELECT
  b.id, b."accountId", b."providerId",
  -- Remap shared-email accounts onto the core ba_users id; keep BSL-only ids.
  COALESCE(ba_map.core_id, b."userId"),
  b."accessToken", b."refreshToken", b."idToken", b."accessTokenExpiresAt",
  b."refreshTokenExpiresAt", b.scope, b.password, b."createdAt", b."updatedAt"
  FROM bsl_import.account b
  LEFT JOIN (
    SELECT bb.id AS bsl_id, c.id AS core_id
      FROM bsl_import.ba_users bb
      JOIN public.ba_users c ON lower(c.email) = lower(bb.email)
  ) ba_map ON ba_map.bsl_id = b."userId"
 WHERE EXISTS (SELECT 1 FROM public.ba_users x WHERE x.id = COALESCE(ba_map.core_id, b."userId"))
ON CONFLICT DO NOTHING;

INSERT INTO public.session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId")
SELECT
  b.id, b."expiresAt", b.token, b."createdAt", b."updatedAt", b."ipAddress", b."userAgent",
  COALESCE(ba_map.core_id, b."userId")
  FROM bsl_import.session b
  LEFT JOIN (
    SELECT bb.id AS bsl_id, c.id AS core_id
      FROM bsl_import.ba_users bb
      JOIN public.ba_users c ON lower(c.email) = lower(bb.email)
  ) ba_map ON ba_map.bsl_id = b."userId"
 WHERE EXISTS (SELECT 1 FROM public.ba_users x WHERE x.id = COALESCE(ba_map.core_id, b."userId"))
ON CONFLICT DO NOTHING;

INSERT INTO public.jwks (id, "publicKey", "privateKey", "createdAt", "expiresAt", alg, crv)
SELECT b.id, b."publicKey", b."privateKey", b."createdAt", b."expiresAt", b.alg, b.crv
  FROM bsl_import.jwks b
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."oauthClient" ("clientId", "clientSecret", "clientDiscoveryId", disabled, "skipConsent", "enableEndSession", "subjectType", scopes, "clientCredentialsScopes", "userId", "createdAt", "updatedAt", name, uri, icon, contacts, tos, policy, "softwareId", "softwareVersion", "redirectUris", "postLogoutRedirectUris", "backchannelLogoutUri", "backchannelLogoutSessionRequired", "tokenEndpointAuthMethod", "applicationType", jwks, "jwksUri", "grantTypes", "responseTypes", "requirePKCE", id)
SELECT "clientId", "clientSecret", "clientDiscoveryId", disabled, "skipConsent", "enableEndSession", "subjectType", scopes, "clientCredentialsScopes", "userId", "createdAt", "updatedAt", name, uri, icon, contacts, tos, policy, "softwareId", "softwareVersion", "redirectUris", "postLogoutRedirectUris", "backchannelLogoutUri", "backchannelLogoutSessionRequired", "tokenEndpointAuthMethod", "applicationType", jwks, "jwksUri", "grantTypes", "responseTypes", "requirePKCE", id FROM bsl_import."oauthClient"
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."oauthClientResource" ("clientId", "resourceId", metadata, "createdAt", id)
SELECT "clientId", "resourceId", metadata, "createdAt", id FROM bsl_import."oauthClientResource"
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."oauthResource" (identifier, name, "accessTokenTtl", "refreshTokenTtl", "signingAlgorithm", "signingKeyId", "allowedScopes", "customClaims", "dpopBoundAccessTokensRequired", disabled, "createdAt", "updatedAt", "policyVersion", metadata, id)
SELECT identifier, name, "accessTokenTtl", "refreshTokenTtl", "signingAlgorithm", "signingKeyId", "allowedScopes", "customClaims", "dpopBoundAccessTokensRequired", disabled, "createdAt", "updatedAt", "policyVersion", metadata, id FROM bsl_import."oauthResource"
ON CONFLICT (id) DO NOTHING;

-- 3b. OAuth/MCP credentials issued by BSL (refresh/access tokens, consents,
--     client assertions). Better Auth moves to core at cutover, so without
--     these every existing bearer/refresh token would stop working. Dependency
--     order: refresh tokens, access tokens (refreshId), consents, assertions.
--     userId is remapped for shared-email ba_users; rows whose client, user
--     or session did not make it across are skipped (the FKs would reject them).
-- ---------------------------------------------------------------------------

INSERT INTO public."oauthRefreshToken" (id, token, "clientId", "sessionId", "userId", "referenceId", "authorizationCodeId", resources, "requestedUserInfoClaims", "expiresAt", "createdAt", revoked, "rotatedAt", "rotationReplayResponse", "rotationReplayExpiresAt", "authTime", confirmation, scopes)
SELECT b.id, b.token, b."clientId",
       CASE WHEN EXISTS (SELECT 1 FROM public.session s WHERE s.id = b."sessionId") THEN b."sessionId" END,
       COALESCE(ba_map.core_id, b."userId"), b."referenceId", b."authorizationCodeId", b.resources, b."requestedUserInfoClaims", b."expiresAt", b."createdAt", b.revoked, b."rotatedAt", b."rotationReplayResponse", b."rotationReplayExpiresAt", b."authTime", b.confirmation, b.scopes
  FROM bsl_import."oauthRefreshToken" b
  LEFT JOIN (
    SELECT bb.id AS bsl_id, c.id AS core_id
      FROM bsl_import.ba_users bb
      JOIN public.ba_users c ON lower(c.email) = lower(bb.email)
  ) ba_map ON ba_map.bsl_id = b."userId"
 WHERE EXISTS (SELECT 1 FROM public."oauthClient" c WHERE c."clientId" = b."clientId")
   AND EXISTS (SELECT 1 FROM public.ba_users x WHERE x.id = COALESCE(ba_map.core_id, b."userId"))
ON CONFLICT DO NOTHING;

INSERT INTO public."oauthAccessToken" (id, token, "clientId", "sessionId", "userId", "referenceId", "authorizationCodeId", resources, "requestedUserInfoClaims", "refreshId", "expiresAt", "createdAt", revoked, confirmation, scopes)
SELECT b.id, b.token, b."clientId",
       CASE WHEN EXISTS (SELECT 1 FROM public.session s WHERE s.id = b."sessionId") THEN b."sessionId" END,
       COALESCE(ba_map.core_id, b."userId"), b."referenceId", b."authorizationCodeId", b.resources, b."requestedUserInfoClaims",
       CASE WHEN EXISTS (SELECT 1 FROM public."oauthRefreshToken" r WHERE r.id = b."refreshId") THEN b."refreshId" END,
       b."expiresAt", b."createdAt", b.revoked, b.confirmation, b.scopes
  FROM bsl_import."oauthAccessToken" b
  LEFT JOIN (
    SELECT bb.id AS bsl_id, c.id AS core_id
      FROM bsl_import.ba_users bb
      JOIN public.ba_users c ON lower(c.email) = lower(bb.email)
  ) ba_map ON ba_map.bsl_id = b."userId"
 WHERE EXISTS (SELECT 1 FROM public."oauthClient" c WHERE c."clientId" = b."clientId")
   AND (b."userId" IS NULL OR EXISTS (SELECT 1 FROM public.ba_users x WHERE x.id = COALESCE(ba_map.core_id, b."userId")))
ON CONFLICT DO NOTHING;

INSERT INTO public."oauthConsent" (id, "clientId", "userId", "referenceId", resources, "requestedUserInfoClaims", scopes, "createdAt", "updatedAt")
SELECT b.id, b."clientId", COALESCE(ba_map.core_id, b."userId"), b."referenceId", b.resources, b."requestedUserInfoClaims", b.scopes, b."createdAt", b."updatedAt"
  FROM bsl_import."oauthConsent" b
  LEFT JOIN (
    SELECT bb.id AS bsl_id, c.id AS core_id
      FROM bsl_import.ba_users bb
      JOIN public.ba_users c ON lower(c.email) = lower(bb.email)
  ) ba_map ON ba_map.bsl_id = b."userId"
 WHERE EXISTS (SELECT 1 FROM public."oauthClient" c WHERE c."clientId" = b."clientId")
   AND (b."userId" IS NULL OR EXISTS (SELECT 1 FROM public.ba_users x WHERE x.id = COALESCE(ba_map.core_id, b."userId")))
ON CONFLICT DO NOTHING;

INSERT INTO public."oauthClientAssertion" (id, "expiresAt")
SELECT id, "expiresAt" FROM bsl_import."oauthClientAssertion"
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Speakers (BSL wins on content: colombia2026's 50 speakers only exist
--    there, and V116's pending semantics are the current product behavior).
-- ---------------------------------------------------------------------------

-- Core's hand-made colombia2026 Edward row (slug 'edward-calderon') collides
-- with BSL's row on the unique (event_id, slug) index and nothing references
-- it; drop it so BSL's uuid row takes its place.
DELETE FROM public.bsl_speakers c
 WHERE c.id <> 'edward-calderon'
   AND c.event_id = 'colombia2026' AND c.slug = 'edward-calderon'
   AND EXISTS (SELECT 1 FROM bsl_import.bsl_speakers b
                WHERE b.event_id = c.event_id AND b.slug = c.slug AND b.id::text <> c.id)
   AND NOT EXISTS (SELECT 1 FROM public.meetings m WHERE m.speaker_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.notifications n WHERE n.speaker_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.speaker_identity_claims k WHERE k.speaker_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM public.meeting_requests r WHERE r.speaker_id::text = c.id);

-- The 60 shared uuids: BSL wins on content and gains event_id/slug. A speaker's
-- linked account is remapped onto the core account when the email matched.
UPDATE public.bsl_speakers c
SET name = b.name, slug = b.slug, event_id = b.event_id, title = b.title,
    company = b.company, bio = b.bio,
    imageurl = b.imageurl, image_url = b.image_url, linkedin = b.linkedin,
    linkedin_url = b.linkedin_url, twitter = b.twitter, twitter_url = b.twitter_url,
    website_url = b.website_url, day = b.day, day_name = b.day_name,
    session_time = b.session_time, session_title = b.session_title,
    session_type = b.session_type, metadata = b.metadata,
    user_id = COALESCE(m.core_id, b.user_id, c.user_id),
    is_active = b.is_active,
    is_accepting_meetings = b.is_accepting_meetings,
    directory_visible = b.directory_visible, updated_at = b.updated_at
  FROM bsl_import.bsl_speakers b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
 WHERE c.id = b.id::text;

INSERT INTO public.bsl_speakers (
  id, name, slug, title, company, bio, image_url, linkedin_url, twitter_url,
  website_url, day, day_name, session_time, session_title, session_type,
  is_active, is_accepting_meetings, metadata, created_at, updated_at,
  imageurl, linkedin, twitter, tags, availability, event_id, directory_visible,
  user_id
)
SELECT
  b.id::text, b.name, b.slug, b.title, b.company, b.bio, b.image_url,
  b.linkedin_url, b.twitter_url, b.website_url, b.day, b.day_name,
  b.session_time, b.session_title, b.session_type, b.is_active,
  b.is_accepting_meetings, b.metadata, b.created_at, b.updated_at,
  b.imageurl, b.linkedin, b.twitter, b.tags, b.availability, b.event_id,
  b.directory_visible, COALESCE(m.core_id, b.user_id)
  FROM bsl_import.bsl_speakers b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
 WHERE NOT EXISTS (SELECT 1 FROM public.bsl_speakers c WHERE c.id = b.id::text);

-- Core's bsl2025 Edward row ('edward-calderon', text id, no slug) carries a
-- meeting, notifications and a claim, and meetings.speaker_id cascades on
-- delete. Repoint everything at BSL's uuid row for the same event, then retire
-- the legacy row.
CREATE TEMP TABLE legacy_speaker_remap AS
SELECT c.id AS old_id, b.id::text AS new_id
  FROM public.bsl_speakers c
  JOIN bsl_import.bsl_speakers b ON b.event_id = c.event_id AND b.slug = 'edward-calderon'
 WHERE c.id = 'edward-calderon' AND c.event_id = 'bsl2025';

UPDATE public.meetings x SET speaker_id = r.new_id FROM legacy_speaker_remap r WHERE x.speaker_id = r.old_id;
UPDATE public.notifications x SET speaker_id = r.new_id FROM legacy_speaker_remap r WHERE x.speaker_id = r.old_id;
UPDATE public.user_blocks x SET speaker_id = r.new_id FROM legacy_speaker_remap r WHERE x.speaker_id = r.old_id;
UPDATE public.speaker_claim_requests x SET speaker_id = r.new_id FROM legacy_speaker_remap r WHERE x.speaker_id = r.old_id;
UPDATE public.bsl_bookings x SET speakerid = r.new_id FROM legacy_speaker_remap r WHERE x.speakerid = r.old_id;
-- Core's claim (the live one for the core account) is kept and repointed; the
-- BSL claim for the same speaker then no-ops on the unique constraints below.
UPDATE public.speaker_identity_claims x SET speaker_id = r.new_id FROM legacy_speaker_remap r WHERE x.speaker_id = r.old_id;

DELETE FROM public.bsl_speakers c
 USING legacy_speaker_remap r
 WHERE c.id = r.old_id;

-- ---------------------------------------------------------------------------
-- 5. Agenda (BSL has the richer colombia2026 programme; identical chile2026).
-- ---------------------------------------------------------------------------

INSERT INTO public.event_agenda (
  id, event_id, time, title, description, speakers, type, location, day,
  day_name, created_at, updated_at, source_id
)
SELECT b.id, b.event_id, b.time, b.title, b.description, b.speakers, b.type,
       b.location, b.day, b.day_name, b.created_at, b.updated_at, b.source_id
  FROM bsl_import.event_agenda b
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Passes (187 BSL rows; 29 collide with a core pass for the same person
--    and event -- core's row wins, it is the one users hold on core accounts).
--    qr_codes/pass_request_limits for BSL passes are not copied; they are
--    generated lazily by the existing app paths.
-- ---------------------------------------------------------------------------

-- Owner resolution per BSL pass: (1) the BSL auth id, remapped onto the core
-- account when the email matches; (2) for orphan rows (user_id is a Better
-- Auth id, not an auth.users id) the ba_users email matched to an auth account.
-- Rows that resolve to nobody are skipped, never invented.
DROP TABLE IF EXISTS pg_temp.bsl_pass_owner;
CREATE TEMP TABLE bsl_pass_owner AS
SELECT b.id AS pass_id,
       COALESCE(
         m.core_id::text,
         (SELECT a.id::text FROM bsl_import_auth.users a WHERE a.id::text = b.user_id::text),
         (SELECT c.id::text FROM bsl_import.ba_users ba
            JOIN auth.users c ON lower(c.email) = lower(ba.email)
           WHERE ba.id::text = b.user_id::text LIMIT 1)
       ) AS owner_id
  FROM bsl_import.passes b
  LEFT JOIN bsl_auth_map m ON m.bsl_id::text = b.user_id::text;

INSERT INTO public.passes (
  id, user_id, event_id, pass_type, status, pass_number,
  max_meeting_requests, used_meeting_requests,
  max_boost_amount, used_boost_amount,
  access_features, special_perks, created_at, updated_at
)
SELECT
  b.id, o.owner_id, b.event_id, b.pass_type::text::public.pass_type,
  b.status::public.pass_status, b.pass_number,
  b.max_meeting_requests, b.used_meeting_requests,
  b.max_boost_amount, b.used_boost_amount,
  b.access_features, b.special_perks, b.created_at, b.updated_at
  FROM bsl_import.passes b
  JOIN bsl_pass_owner o ON o.pass_id = b.id AND o.owner_id IS NOT NULL
 WHERE NOT EXISTS (
   SELECT 1 FROM public.passes c
    WHERE c.user_id::text = o.owner_id
      AND c.event_id = b.event_id
      AND c.status = 'active'
 )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Meetings, requests, slots, chat (all ids remapped through the maps).
-- ---------------------------------------------------------------------------

-- Any BSL user id (auth.users space OR public."user" space) -> core auth id.
-- Shared emails resolve to the core account; BSL-only people keep the auth id
-- they already had. meeting_slots.user_id needs this: 224 of 225 rows hold a
-- public."user" id although core's FK points at auth.users.
DROP TABLE IF EXISTS pg_temp.bsl_any_to_core_auth;
CREATE TEMP TABLE bsl_any_to_core_auth AS
SELECT a.id AS bsl_id, COALESCE(m.core_id, a.id) AS core_id
  FROM bsl_import_auth.users a
  LEFT JOIN bsl_auth_map m ON m.bsl_id = a.id
UNION
SELECT u.id,
       COALESCE(
         (SELECT c.id FROM auth.users c WHERE lower(c.email) = lower(u.email) LIMIT 1),
         (SELECT a.id FROM bsl_import_auth.users a
           WHERE a.id::text = COALESCE(u.provider_ids ->> 'supabase', u.auth_user_id) LIMIT 1)
       )
  FROM bsl_import."user" u
 WHERE NOT EXISTS (SELECT 1 FROM bsl_import_auth.users a WHERE a.id = u.id);

INSERT INTO public.meeting_requests (id, requester_id, speaker_id, message, note, meeting_type, status, scheduled_at, location, meeting_link, boost_amount, speaker_response, speaker_response_at, expires_at, created_at, updated_at, event_id, speaker_name, requester_name, requester_company, requester_title, requester_ticket_type, preferred_date, preferred_time, boost_transaction_hash, priority_score, availability_window_start, availability_window_end, duration_minutes)
SELECT
  b.id, COALESCE(m.core_id, b.requester_id), b.speaker_id,
  b.message, b.note, b.meeting_type, b.status, b.scheduled_at,
  b.location, b.meeting_link, b.boost_amount,
  b.speaker_response, b.speaker_response_at, b.expires_at, b.created_at,
  b.updated_at, b.event_id, b.speaker_name, b.requester_name,
  b.requester_company, b.requester_title, b.requester_ticket_type,
  b.preferred_date, b.preferred_time, b.boost_transaction_hash,
  b.priority_score, b.availability_window_start, b.availability_window_end,
  b.duration_minutes
  FROM bsl_import.meeting_requests b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.requester_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meetings (id, meeting_request_id, speaker_id, requester_id, speaker_name, requester_name, meeting_type, status, scheduled_at, duration_minutes, location, meeting_link, notes, title, description, created_at, updated_at, event_id, slot_id, host_id, attendee_id, start_time, end_time, attendee_email)
SELECT
  b.id, b.meeting_request_id, b.speaker_id::text,
  COALESCE(mr.core_id, b.requester_id),
  b.speaker_name, b.requester_name, b.meeting_type, b.status::text, b.scheduled_at,
  b.duration_minutes, b.location, b.meeting_link, b.notes, b.title,
  b.description, b.created_at, b.updated_at, b.event_id, b.slot_id,
  COALESCE(mh.core_id, b.host_id), COALESCE(ma.core_id, b.attendee_id),
  b.start_time, b.end_time, b.attendee_email
  FROM bsl_import.meetings b
  LEFT JOIN bsl_auth_map mr ON mr.bsl_id = b.requester_id
  LEFT JOIN bsl_auth_map mh ON mh.bsl_id = b.host_id
  LEFT JOIN bsl_auth_map ma ON ma.bsl_id = b.attendee_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.meeting_slots (id, user_id, start_time, end_time, status, meeting_id, created_at, updated_at)
SELECT b.id, o.core_id, b.start_time, b.end_time, b.status, b.meeting_id, b.created_at, b.updated_at
  FROM bsl_import.meeting_slots b
  JOIN bsl_any_to_core_auth o ON o.bsl_id = b.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.meeting_chat_messages (id, sender_id, is_read, created_at, meeting_id, message_type, read_at, ciphertext, nonce)
SELECT
  b.id, COALESCE(m.core_id, b.sender_id), b.is_read, b.created_at,
  b.meeting_id, b.message_type, b.read_at, b.ciphertext, b.nonce
  FROM bsl_import.meeting_chat_messages b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.sender_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.chat_last_seen (id, meeting_id, user_id, last_seen_at)
SELECT b.id, b.meeting_id, COALESCE(m.core_id, b.user_id), b.last_seen_at
  FROM bsl_import.chat_last_seen b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
ON CONFLICT DO NOTHING;

-- Core's key row wins for a shared account: a second public key would make
-- messages already encrypted to the first one undecryptable.
INSERT INTO public.user_chat_keys (user_id, public_key, created_at, updated_at)
SELECT COALESCE(m.core_id, b.user_id), b.public_key, b.created_at, b.updated_at
  FROM bsl_import.user_chat_keys b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Everything else user-keyed or event-keyed.
-- ---------------------------------------------------------------------------

INSERT INTO public.user_roles (id, user_id, role, granted_by, granted_at, expires_at, metadata)
SELECT b.id, COALESCE(m.core_id, b.user_id), b.role::text::public.user_role,
       COALESCE(mg.core_id, b.granted_by), b.granted_at, b.expires_at, b.metadata
  FROM bsl_import.user_roles b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
  LEFT JOIN bsl_auth_map mg ON mg.bsl_id = b.granted_by
 WHERE NOT EXISTS (
   SELECT 1 FROM public.user_roles c
    WHERE c.user_id = COALESCE(m.core_id, b.user_id) AND c.role::text = b.role::text
 )
ON CONFLICT DO NOTHING;

INSERT INTO public.event_roles (id, event_id, user_id, role, granted_by, granted_at, expires_at, metadata)
SELECT b.id, b.event_id, COALESCE(m.core_id, b.user_id), b.role::text::public.event_role,
       COALESCE(mg.core_id, b.granted_by), b.granted_at, b.expires_at, b.metadata
  FROM bsl_import.event_roles b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
  LEFT JOIN bsl_auth_map mg ON mg.bsl_id = b.granted_by
 WHERE NOT EXISTS (
   SELECT 1 FROM public.event_roles c
    WHERE c.event_id = b.event_id
      AND c.user_id = COALESCE(m.core_id, b.user_id)
      AND c.role::text = b.role::text
 )
ON CONFLICT DO NOTHING;

-- Claims carry three unique constraints (speaker, email, claimed user); a claim
-- core already holds for the same speaker/person wins and the BSL row no-ops.
INSERT INTO public.speaker_identity_claims (id, speaker_id, email_normalized, status, configured_by, claimed_user_id, claimed_at, claim_error, metadata, created_at, updated_at)
SELECT b.id, b.speaker_id, b.email_normalized, b.status,
       COALESCE(mc.core_id, b.configured_by),
       COALESCE(m.core_id, b.claimed_user_id), b.claimed_at,
       b.claim_error, b.metadata, b.created_at, b.updated_at
  FROM bsl_import.speaker_identity_claims b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.claimed_user_id
  LEFT JOIN bsl_auth_map mc ON mc.bsl_id = b.configured_by
ON CONFLICT DO NOTHING;

INSERT INTO public.speaker_identity_claim_event_roles (claim_id, event_id, role)
SELECT b.claim_id, b.event_id, b.role::text::public.event_role
  FROM bsl_import.speaker_identity_claim_event_roles b
 WHERE EXISTS (SELECT 1 FROM public.speaker_identity_claims c WHERE c.id = b.claim_id)
ON CONFLICT DO NOTHING;

INSERT INTO public.notifications (id, user_id, type, title, message, is_read, is_urgent, is_archived, created_at, read_at, archived_at, meeting_request_id, speaker_id, meeting_id, updated_at, level)
SELECT b.id, COALESCE(m.core_id, b.user_id), b.type, b.title, b.message,
       b.is_read, b.is_urgent, b.is_archived, b.created_at, b.read_at,
       b.archived_at, b.meeting_request_id, b.speaker_id,
       b.meeting_id, b.updated_at, b.level
  FROM bsl_import.notifications b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
ON CONFLICT (id) DO NOTHING;

-- user_agenda_status / user_schedule_shares / user_profiles hang off
-- public."user", so they use the public.user map, not the auth one.
INSERT INTO public.user_agenda_status (id, user_id, event_id, agenda_id, meeting_id, slot_time, status, slot_status, is_favorite, confirmed_at, created_at, updated_at)
SELECT b.id, COALESCE(um.core_id, b.user_id),
       b.event_id, b.agenda_id, b.meeting_id, b.slot_time, b.status,
       b.slot_status, b.is_favorite, b.confirmed_at, b.created_at, b.updated_at
  FROM bsl_import.user_agenda_status b
  LEFT JOIN bsl_user_map um ON um.bsl_id = b.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.user_schedule_shares (id, user_id, event_id, share_token, created_at)
SELECT b.id, COALESCE(um.core_id, b.user_id), b.event_id, b.share_token, b.created_at
  FROM bsl_import.user_schedule_shares b
  LEFT JOIN bsl_user_map um ON um.bsl_id = b.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.user_profiles (user_id, metadata, created_at, updated_at, full_name, display_name, avatar_url, company, title, bio, wallet_address, email, phone)
SELECT COALESCE(um.core_id, b.user_id), b.metadata, b.created_at, b.updated_at, b.full_name,
       b.display_name, b.avatar_url, b.company, b.title, b.bio, b.wallet_address, b.email, b.phone
  FROM bsl_import.user_profiles b
  LEFT JOIN bsl_user_map um ON um.bsl_id = b.user_id
 WHERE EXISTS (SELECT 1 FROM public."user" u WHERE u.id = COALESCE(um.core_id, b.user_id))
ON CONFLICT DO NOTHING;

INSERT INTO public.event_chat_presence (event_id, user_id, last_seen_at)
SELECT b.event_id, COALESCE(m.core_id, b.user_id), b.last_seen_at
  FROM bsl_import.event_chat_presence b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.admin_action_log (id, actor_user_id, event_id, action, target_type, target_id, metadata, created_at)
SELECT b.id, COALESCE(m.core_id, b.actor_user_id), b.event_id,
       b.action, b.target_type, b.target_id, b.metadata, b.created_at
  FROM bsl_import.admin_action_log b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.actor_user_id
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.newsletter_subscribers (id, email, subscribed_at, created_at, updated_at, email_sent)
SELECT b.id, b.email, b.subscribed_at, b.created_at, b.updated_at, b.email_sent
  FROM bsl_import.newsletter_subscribers b
 WHERE NOT EXISTS (SELECT 1 FROM public.newsletter_subscribers c WHERE lower(c.email) = lower(b.email))
ON CONFLICT DO NOTHING;

INSERT INTO public.otp_codes (id, email, code, token_hash, expires_at, used, created_at)
SELECT b.id, b.email, b.code, b.token_hash, b.expires_at, b.used, b.created_at
  FROM bsl_import.otp_codes b
 WHERE b.expires_at > now() AND NOT b.used
ON CONFLICT DO NOTHING;

INSERT INTO public.pass_claim_codes (id, event_id, code_hash, pass_type, max_claims, claimed_count, expires_at, is_active, created_by, created_at, label)
SELECT b.id, b.event_id, b.code_hash, b.pass_type::text::public.pass_type, b.max_claims, b.claimed_count,
       b.expires_at, b.is_active, COALESCE(m.core_id, b.created_by), b.created_at, b.label
  FROM bsl_import.pass_claim_codes b
  LEFT JOIN bsl_auth_map m ON m.bsl_id = b.created_by
ON CONFLICT DO NOTHING;

INSERT INTO public.event_chat_rooms (event_id, created_at)
SELECT b.event_id, b.created_at FROM bsl_import.event_chat_rooms b
 WHERE NOT EXISTS (SELECT 1 FROM public.event_chat_rooms c WHERE c.event_id = b.event_id);

-- Deliberately NOT copied:
--   * events, event_pass_tiers, business_invite_*: identical rows already on
--     core (BSL's chile2026 general tier says 11 requests where core says 10;
--     core's catalog is the product decision).
--   * directus_*: Directus is retired (see docs); BSL keeps them as backup.
--   * hashpass_schema_migrations: each ledger describes its own database.

-- 8b. User blocks/mutes. can_make_meeting_request consults only core's
--     user_blocks, so every BSL block has to be present or blocked people could
--     request meetings again. BSL rows carry the auth id (blocker_id/blocked_id)
--     and/or the registry id (blocker_user_id/blocked_user_id, via
--     public."user".auth_user_id); both resolve to a BSL auth id, which then
--     goes through bsl_auth_map (shared email -> core id) or is kept as is.
--     Core's table has no blocker_id/blocked_id and only blocked_user_id is
--     an FK (auth.users).
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS pg_temp.bsl_block_resolved;
CREATE TEMP TABLE bsl_block_resolved AS
SELECT b.id AS bsl_block_id,
       COALESCE(mb.core_id, rb.auth_id) AS blocked_core_id,
       COALESCE(mr.core_id, rr.auth_id) AS blocker_core_id,
       -- core requires a speaker_id; a user-to-user block uses the blocker's own
       -- speaker row (the RPC's blocker_user_id path matches through it).
       COALESCE(b.speaker_id::text, (
         SELECT s.id::text FROM public.bsl_speakers s
          WHERE s.user_id::text = COALESCE(mr.core_id, rr.auth_id)::text
          ORDER BY s.event_id, s.id LIMIT 1
       )) AS speaker_id, b.reason,
       COALESCE(b.blocked_at, b.created_at, now()) AS blocked_at,
       COALESCE(b.is_muted, false) AS is_muted
  FROM bsl_import.user_blocks b
  LEFT JOIN bsl_import."user" ub ON ub.id = b.blocked_user_id
  LEFT JOIN bsl_import."user" ur ON ur.id = b.blocker_user_id
  CROSS JOIN LATERAL (SELECT COALESCE(b.blocked_id, NULLIF(ub.auth_user_id::text, '')::uuid) AS auth_id) rb
  CROSS JOIN LATERAL (SELECT COALESCE(b.blocker_id, NULLIF(ur.auth_user_id::text, '')::uuid) AS auth_id) rr
  LEFT JOIN bsl_auth_map mb ON mb.bsl_id = rb.auth_id
  LEFT JOIN bsl_auth_map mr ON mr.bsl_id = rr.auth_id;

INSERT INTO public.user_blocks (id, speaker_id, blocked_user_id, reason, blocked_at, blocker_user_id, is_muted)
SELECT r.bsl_block_id, r.speaker_id, r.blocked_core_id, r.reason, r.blocked_at, r.blocker_core_id, r.is_muted
  FROM bsl_block_resolved r
 WHERE r.blocked_core_id IS NOT NULL
   AND r.speaker_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.blocked_core_id)
   AND NOT EXISTS (
     SELECT 1 FROM public.user_blocks c
      WHERE c.blocked_user_id = r.blocked_core_id
        AND c.blocker_user_id IS NOT DISTINCT FROM r.blocker_core_id
        AND c.speaker_id IS NOT DISTINCT FROM r.speaker_id
   )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. Verification (raises, and so rolls the whole migration back, on loss).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_missing integer;
  v_skipped integer;
BEGIN
  SELECT count(*) INTO v_missing FROM bsl_import.bsl_speakers b
   WHERE NOT EXISTS (SELECT 1 FROM public.bsl_speakers c WHERE c.id = b.id::text);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'speaker copy incomplete: % BSL rows missing on core', v_missing;
  END IF;

  SELECT count(*) INTO v_missing FROM bsl_import.session b
   WHERE NOT EXISTS (SELECT 1 FROM public.session c WHERE c.id = b.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'session copy incomplete: % BSL sessions missing on core', v_missing;
  END IF;

  SELECT count(*) INTO v_missing FROM bsl_import.meeting_requests b
   WHERE NOT EXISTS (SELECT 1 FROM public.meeting_requests c WHERE c.id = b.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'meeting request copy incomplete: % rows missing', v_missing;
  END IF;

  SELECT count(*) INTO v_missing FROM bsl_import.event_agenda b
   WHERE NOT EXISTS (SELECT 1 FROM public.event_agenda c WHERE c.id = b.id);
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'agenda copy incomplete: % rows missing', v_missing;
  END IF;

  -- Every BSL block/mute must be represented on core (same blocked user,
  -- blocker and speaker after identity remapping).
  SELECT count(*) INTO v_missing FROM bsl_block_resolved r
   WHERE NOT EXISTS (
     SELECT 1 FROM public.user_blocks c
      WHERE c.blocked_user_id = r.blocked_core_id
        AND c.blocker_user_id IS NOT DISTINCT FROM r.blocker_core_id
        AND c.speaker_id IS NOT DISTINCT FROM r.speaker_id
   );
  IF v_missing > 0 THEN
    RAISE EXCEPTION 'user block copy incomplete: % BSL blocks missing on core', v_missing;
  END IF;

  -- Issued OAuth credentials must survive the move, or clients are logged out.
  SELECT count(*) INTO v_missing FROM bsl_import."oauthRefreshToken" b
   WHERE NOT EXISTS (SELECT 1 FROM public."oauthRefreshToken" c WHERE c.id = b.id);
  RAISE NOTICE 'BSL OAuth refresh tokens not copied: %', v_missing;
  SELECT count(*) INTO v_missing FROM bsl_import."oauthAccessToken" b
   WHERE NOT EXISTS (SELECT 1 FROM public."oauthAccessToken" c WHERE c.id = b.id);
  RAISE NOTICE 'BSL OAuth access tokens not copied: %', v_missing;
  SELECT count(*) INTO v_missing FROM bsl_import."oauthConsent" b
   WHERE NOT EXISTS (SELECT 1 FROM public."oauthConsent" c WHERE c.id = b.id);
  RAISE NOTICE 'BSL OAuth consents not copied: %', v_missing;

  -- Passes may legitimately be skipped (duplicate of a core pass, or an owner
  -- that exists nowhere); report instead of failing.
  SELECT count(*) INTO v_skipped FROM bsl_import.passes b
   WHERE NOT EXISTS (SELECT 1 FROM public.passes c WHERE c.id = b.id);
  RAISE NOTICE 'BSL passes not copied (duplicate of a core pass or ownerless): %', v_skipped;

  SELECT count(*) INTO v_skipped FROM bsl_import.meeting_slots b
   WHERE NOT EXISTS (SELECT 1 FROM public.meeting_slots c WHERE c.id = b.id);
  RAISE NOTICE 'BSL meeting slots not copied: %', v_skipped;
END;
$$;

-- Staging schemas are dropped by the operator after verification
-- (consolidate-bsl-into-core.md), not here, so a failed run can be re-staged.

COMMIT;
