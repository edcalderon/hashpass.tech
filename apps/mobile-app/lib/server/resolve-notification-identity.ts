import { getSupabaseServerForRequest } from '../supabase-server';
import { authenticateRequest, extractToken } from '@hashpass/auth';
import { getBetterAuthSessionUser } from './better-auth';
import { resolveSupabaseProfile, hostnameFromRequest } from '../../config/supabase-profiles';
import { recordDbFailure, recordDbSuccess, shouldBackOff } from './db-health-guard';

// Short-lived cache for the registry lookup this module does on every
// authenticated API call (~15 call sites -- notifications, admin/access,
// meetings, chat, passes, etc). Uncached, this resolved 14,474 times against
// one dev DB in a single test session (confirmed via pg_stat_statements) --
// almost entirely redundant identical lookups for the same handful of users
// within seconds of each other. A warm Lambda container serves many
// invocations, so a short in-memory TTL cache removes the bulk of that
// without meaningfully staling the result (registry rows change rarely).
const REGISTRY_CACHE_TTL_MS = 30_000;
const registryCache = new Map<string, { value: { id: string | null; provider_ids?: any } | null; expiresAt: number }>();

const getCachedRegistryRow = (email: string) => {
  const cached = registryCache.get(email);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  return undefined; // undefined = not cached (distinct from null = cached "no row")
};

const setCachedRegistryRow = (email: string, value: { id: string | null; provider_ids?: any } | null) => {
  registryCache.set(email, { value, expiresAt: Date.now() + REGISTRY_CACHE_TTL_MS });
};

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
  // registry directly rather than auth.users, such as user_agenda_status.
  // Using supabaseUserId against those tables fails their FK constraint,
  // since public.user.id is independently generated (uuid_generate_v4()) and
  // only equals the auth id by coincidence — this was the cause of
  // agenda-status POST returning 500 with "Key (user_id)=(...) is not
  // present in table user".
  //
  // Meeting requests and notifications use supabaseUserId. Their pass checks,
  // claimed speaker ownership, and foreign keys all target auth.users(id).
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
  user: AuthenticatedUser,
  guardContext?: { profileId: string; environment: 'development' | 'production' }
): Promise<ResolvedNotificationIdentity> {
  const email = user.email?.trim().toLowerCase() || '';
  if (!email) {
    return { supabaseUserId: null, registryUserId: null, email: '' };
  }

  const cached = getCachedRegistryRow(email);
  if (cached !== undefined) {
    return {
      supabaseUserId: cached?.provider_ids?.supabase ?? null,
      registryUserId: cached?.id ?? null,
      email,
    };
  }

  try {
    const { data: registryRow, error } = await (supabase as any)
      .from('user')
      .select('id, provider_ids')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('[resolve-notification-identity] registry lookup failed:', error);
      if (guardContext) recordDbFailure({ ...guardContext, context: 'registry lookup', error });
      return { supabaseUserId: null, registryUserId: null, email };
    }

    if (guardContext) recordDbSuccess(guardContext.profileId);
    setCachedRegistryRow(email, registryRow ?? null);
    const supabaseUserId = registryRow?.provider_ids?.supabase ?? null;
    const registryUserId = registryRow?.id ?? null;
    return { supabaseUserId, registryUserId, email };
  } catch (registryError) {
    console.error('[resolve-notification-identity] registry lookup failed:', registryError);
    if (guardContext) recordDbFailure({ ...guardContext, context: 'registry lookup', error: registryError });
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
  params: { email: string; authUserId: string; fullName?: string | null; avatarUrl?: string | null },
  guardContext?: { profileId: string; environment: 'development' | 'production' }
): Promise<string | null> {
  const cached = getCachedRegistryRow(params.email);
  if (cached !== undefined && cached?.id) {
    return cached.id;
  }

  try {
    const { data: existing, error } = await (supabase as any)
      .from('user')
      .select('id')
      .eq('email', params.email)
      .maybeSingle();

    if (!error && existing?.id) {
      if (guardContext) recordDbSuccess(guardContext.profileId);
      return existing.id;
    }
    if (error && guardContext) recordDbFailure({ ...guardContext, context: 'registry self-heal lookup', error });

    // The self-heal write is the expensive, retry-prone part (an RPC that
    // does its own INSERT/UPDATE) -- skip it while the backend is already
    // flagged unhealthy instead of adding write load to a struggling DB on
    // every single request. The caller already has a well-defined fallback
    // for a null registryUserId.
    if (guardContext && shouldBackOff(guardContext.profileId)) {
      return null;
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
      if (guardContext) recordDbFailure({ ...guardContext, context: 'registry self-heal upsert', error: upsertError });
      return null;
    }

    if (guardContext) recordDbSuccess(guardContext.profileId);
    if (upserted?.id) setCachedRegistryRow(params.email, { id: upserted.id, provider_ids: { supabase: params.authUserId } });
    return upserted?.id ?? null;
  } catch (e) {
    console.error('[resolve-notification-identity] registry self-heal failed:', e);
    if (guardContext) recordDbFailure({ ...guardContext, context: 'registry self-heal', error: e });
    return null;
  }
}

// Resolves the authenticated caller's real Supabase auth UUID, regardless of
// which auth provider (Supabase, Better Auth, Directus) actually issued
// their session. Providers other than Supabase use their own id format
// (e.g. Better Auth's non-UUID ids), which are resolved through the canonical
// public.user registry and its provider_ids->>'supabase' link.
export async function resolveNotificationIdentity(
  request: Request,
  profileId?: string,
): Promise<ResolvedNotificationIdentity | ResolveIdentityError> {
  const supabase = getSupabaseServerForRequest(request, profileId);
  const token = extractToken(request);
  const resolvedProfile = resolveSupabaseProfile({ hostname: hostnameFromRequest(request), profileId });
  const guardContext = { profileId: resolvedProfile.id, environment: resolvedProfile.environment };

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
          ? await resolveOrCreateRegistryUserId(
              supabase,
              {
                email,
                authUserId: data.user.id,
                fullName,
                avatarUrl,
              },
              guardContext
            )
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
    return resolveSupabaseIdentityForUser(supabase, user, guardContext);
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
    return resolveSupabaseIdentityForUser(supabase, betterAuthUser, guardContext);
  }

  // Neither the bearer nor the Better Auth cookie authenticated the caller.
  return { error: error || 'Unauthorized', status: 401 };
}
