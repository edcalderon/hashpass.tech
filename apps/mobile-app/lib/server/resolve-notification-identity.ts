import { getSupabaseServerForRequest } from '../supabase-server';
import { authenticateRequest, extractToken } from '@hashpass/auth';
import { getBetterAuthSessionUser } from './better-auth';

type AuthenticatedUser = {
  id: string;
  email?: string | null;
};

export interface ResolvedNotificationIdentity {
  // Real Supabase auth.users(id) UUID. Required for tables that reference
  // auth.users(id) directly (e.g. user_roles, user_profiles). Null when the
  // authenticated user has never had a Supabase auth session linked to
  // their account (e.g. Better-Auth-only users).
  supabaseUserId: string | null;
  // public.user(id) — the canonical registry's own generated primary key,
  // distinct from supabaseUserId. Required for tables that reference the
  // registry directly rather than auth.users: user_agenda_status and
  // notifications (see packages/tools/scripts/sql/target-bsl-bootstrap.sql).
  // Using supabaseUserId against those tables fails their FK constraint,
  // since public.user.id is independently generated (uuid_generate_v4()) and
  // only equals the auth id by coincidence — this was the cause of
  // agenda-status POST returning 500 with "Key (user_id)=(...) is not
  // present in table user".
  //
  // meeting_requests is NOT in this group despite an earlier version of
  // this comment (and app/api/events/[eventId]/meetings/requests+api.ts) treating it
  // as one — meeting_requests.requester_id has no FK constraint at all, and
  // the live write path (insert_meeting_request RPC in
  // target-bsl-bootstrap.sql) stores the caller-supplied id unchanged after
  // validating it against passes.user_id (the auth.users id) via
  // can_make_meeting_request. Use supabaseUserId for meeting_requests.
  registryUserId: string | null;
  email: string;
}

export interface ResolveIdentityError {
  error: string;
  status: number;
}

export function isResolveIdentityError(
  value: ResolvedNotificationIdentity | ResolveIdentityError
): value is ResolveIdentityError {
  return typeof (value as ResolveIdentityError).status === 'number';
}

/**
 * Map an authenticated provider account to the UUID used by Supabase-owned
 * tables. Directus and Better Auth issue their own user IDs, while role and
 * event access records are constrained to auth.users(id). The public user
 * registry is the canonical link between those identities.
 */
export async function resolveSupabaseIdentityForUser(
  supabase: ReturnType<typeof getSupabaseServerForRequest>,
  user: AuthenticatedUser
): Promise<ResolvedNotificationIdentity> {
  const email = user.email?.trim().toLowerCase() || '';
  if (!email) {
    return { supabaseUserId: null, registryUserId: null, email: '' };
  }

  try {
    const { data: registryRow, error } = await (supabase as any)
      .from('user')
      .select('id, provider_ids')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[resolve-notification-identity] registry lookup failed:', error);
      return { supabaseUserId: null, registryUserId: null, email };
    }

    const supabaseUserId = registryRow?.provider_ids?.supabase ?? null;
    const registryUserId = registryRow?.id ?? null;
    return { supabaseUserId, registryUserId, email };
  } catch (registryError) {
    console.error('[resolve-notification-identity] registry lookup failed:', registryError);
    return { supabaseUserId: null, registryUserId: null, email };
  }
}

// Looks up the caller's public.user(id) registry row by email, self-healing
// (upserting) a missing row when the caller already holds a verified
// Supabase session. A row can legitimately be missing if their auth.users
// record predates the sync trigger, or if a native sign-in path completed
// without ever calling syncPublicUserRegistry — in both cases the caller is
// still a real, verified user, so this repairs the registry gap in place
// rather than permanently failing every write for that account.
async function resolveOrCreateRegistryUserId(
  supabase: ReturnType<typeof getSupabaseServerForRequest>,
  params: { email: string; authUserId: string; fullName?: string | null; avatarUrl?: string | null }
): Promise<string | null> {
  try {
    const { data: existing, error } = await (supabase as any)
      .from('user')
      .select('id')
      .eq('email', params.email)
      .maybeSingle();

    if (!error && existing?.id) {
      return existing.id;
    }

    const { data: upserted, error: upsertError } = await (supabase as any).rpc(
      'upsert_public_user_registry',
      {
        p_payload: {
          provider: 'supabase',
          auth_provider: 'supabase',
          auth_user_id: params.authUserId,
          email: params.email,
          full_name: params.fullName ?? null,
          avatar_url: params.avatarUrl ?? null,
          role: 'user',
          status: 'active',
          auth_metadata: {},
          profile_metadata: {},
          provider_ids: { supabase: params.authUserId },
        },
      }
    );

    if (upsertError) {
      console.error('[resolve-notification-identity] registry self-heal failed:', upsertError);
      return null;
    }

    return upserted?.id ?? null;
  } catch (e) {
    console.error('[resolve-notification-identity] registry self-heal failed:', e);
    return null;
  }
}

// Resolves the authenticated caller's real Supabase auth UUID, regardless of
// which auth provider (Supabase, Better Auth, Directus) actually issued
// their session. Providers other than Supabase use their own id format
// (e.g. Better Auth's non-UUID ids), which can't be used directly against
// notifications.user_id — it's resolved via the canonical public.user
// registry (provider_ids->>'supabase'), kept in sync by a trigger on
// auth.users.
export async function resolveNotificationIdentity(
  request: Request
): Promise<ResolvedNotificationIdentity | ResolveIdentityError> {
  const supabase = getSupabaseServerForRequest(request);
  const token = extractToken(request);

  // 1. Try a direct Supabase bearer token first — covers native Android and
  //    any web session that already went through Supabase auth. If this
  //    succeeds, user.id IS already the real Supabase UUID; no further
  //    resolution needed for supabaseUserId. registryUserId (public.user.id)
  //    is a separate id space and still needs its own lookup.
  if (token) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (data?.user && !error) {
        const email = data.user.email?.trim().toLowerCase() || '';
        const metadata = (data.user.user_metadata as Record<string, unknown> | undefined) || {};
        const fullName = (metadata.full_name as string | undefined) || (metadata.name as string | undefined) || null;
        const avatarUrl =
          (metadata.avatar_url as string | undefined) || (metadata.picture as string | undefined) || null;
        const registryUserId = email
          ? await resolveOrCreateRegistryUserId(supabase, {
              email,
              authUserId: data.user.id,
              fullName,
              avatarUrl,
            })
          : null;
        return { supabaseUserId: data.user.id, registryUserId, email: data.user.email || '' };
      }
    } catch {
      // fall through to the provider-routed path below
    }
  }

  // 2. Preserve an explicit provider bearer token's precedence. This avoids a
  //    browser's Better Auth cookie overriding a valid Directus bearer from a
  //    different principal when both happen to be present.
  const { user, error } = await authenticateRequest(request);
  if (user && !error) {
    if (!user.email) {
      return { error: 'Authenticated user has no email on record', status: 400 };
    }
    return resolveSupabaseIdentityForUser(supabase, user);
  }

  // 3. A Better Auth session is cookie-backed. Verify it directly after a
  //    provider bearer could not be authenticated: core still advertises
  //    Directus in its tenant configuration, so authenticateRequest() alone
  //    would reject a valid Better Auth cookie while the asynchronous Supabase
  //    bridge is still creating a JWT. This also keeps notification and
  //    admin-access requests usable if that bridge needs to retry.
  const betterAuthUser = await getBetterAuthSessionUser(request);
  if (betterAuthUser) {
    if (!betterAuthUser.email) {
      return { error: 'Authenticated user has no email on record', status: 400 };
    }
    return resolveSupabaseIdentityForUser(supabase, betterAuthUser);
  }

  // Neither the bearer nor the Better Auth cookie authenticated the caller.
  return { error: error || 'Unauthorized', status: 401 };
}
