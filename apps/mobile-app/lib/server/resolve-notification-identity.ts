import { getSupabaseServerForRequest } from '../supabase-server';
import { authenticateRequest, extractToken } from '@hashpass/auth';

export interface ResolvedNotificationIdentity {
  // Real Supabase auth.users(id) UUID — required to query/mutate the
  // notifications table (its user_id column is `REFERENCES auth.users(id)`).
  // Null when the authenticated user has never had a Supabase auth session
  // linked to their account (e.g. Better-Auth-only users) — they simply
  // have no notifications rows to read.
  supabaseUserId: string | null;
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
  //    resolution needed.
  if (token) {
    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (data?.user && !error) {
        return { supabaseUserId: data.user.id, email: data.user.email || '' };
      }
    } catch {
      // fall through to the provider-routed path below
    }
  }

  // 2. Fall back to provider-routed verification — covers Better Auth
  //    (cookie-backed session) and Directus (Bearer token) tenants.
  const { user, error } = await authenticateRequest(request);
  if (error || !user) {
    return { error: error || 'Unauthorized', status: 401 };
  }
  if (!user.email) {
    return { error: 'Authenticated user has no email on record', status: 400 };
  }

  const email = user.email.trim().toLowerCase();

  try {
    const { data: registryRow } = await (supabase as any)
      .from('user')
      .select('provider_ids')
      .eq('email_normalized', email)
      .maybeSingle();

    const supabaseUserId = registryRow?.provider_ids?.supabase ?? null;
    return { supabaseUserId, email };
  } catch (registryError) {
    console.error('[resolve-notification-identity] registry lookup failed:', registryError);
    return { supabaseUserId: null, email };
  }
}
