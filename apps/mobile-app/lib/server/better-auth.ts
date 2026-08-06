import { betterAuth } from 'better-auth';
import { ENV_CONFIG, SSO_CONFIG } from '@hashpass/config';
import { syncPublicUserRegistry } from '../auth/public-user-registry';
import { ensureSupabaseAccountForEmail } from '../auth/supabase-admin-bridge';
import { getSupabaseServerForRequest } from '../supabase-server';
import { sendWelcomeEmailToNewUser } from '../email';
import { getDatabasePool, hasDatabaseConnectionString } from './database-pool';

const normalizeAuthPath = (value?: string | null): string => {
  const trimmed = (value || '/api/auth').trim();
  if (!trimmed) return '/api/auth';
  const normalized = trimmed.startsWith('/') ? trimmed.replace(/\/$/, '') : `/${trimmed.replace(/\/$/, '')}`;
  const legacySegment = ['bsl', 'auth'].join('-');
  return normalized.replace(new RegExp(`/${legacySegment}$`), '/auth');
};

const normalizeAuthURL = (value?: string | null): string | undefined => {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  const legacySegment = ['bsl', 'auth'].join('-');
  return trimmed.replace(/\/$/, '').replace(new RegExp(`/${legacySegment}$`), '/auth');
};

const AUTH_BASE_PATH = normalizeAuthPath(process.env.BETTER_AUTH_BASE_PATH || '/api/auth');
const DEFAULT_ALLOWED_HOSTS = Array.from(
  new Set([
    'localhost',
    '127.0.0.1',
    // Better Auth matches the raw Host header, which includes the port for
    // non-default ports — bare 'localhost' does not match 'localhost:8081'.
    // Without these, every local /api/auth/* request 500s with "Host ...
    // is not in the allowed hosts list", even though 'localhost' is listed.
    'localhost:8081',
    '127.0.0.1:8081',
    'localhost:19006',
    'localhost:3000',
    'api.hashpass.tech',
    'api-dev.hashpass.tech',
    ...Object.values(SSO_CONFIG.tenants).flatMap((tenant) => {
      const t = tenant as { domain: string; hostnames?: string[] };
      return [t.domain, ...(t.hostnames || [])];
    }),
  ])
);
const DEFAULT_TRUSTED_ORIGINS = SSO_CONFIG.cors.origins;

const readEnv = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value || undefined;
};

const readListEnv = (name: string): string[] =>
  (readEnv(name) || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export { getDatabasePool };

const splitName = (name?: string | null) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const [firstName, ...rest] = trimmed.split(/\s+/);
  return { firstName, lastName: rest.join(' ') || null };
};

const resolveRequestHostname = (request?: Request): string => {
  if (!(request instanceof Request)) {
    return '';
  }

  const origin = request.headers.get('origin') || request.headers.get('referer') || '';
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      // Fall through to forwarded/host headers.
    }
  }

  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    try {
      return new URL(`https://${forwardedHost.split(',')[0].trim()}`).hostname.toLowerCase();
    } catch {
      return forwardedHost.split(',')[0].trim().toLowerCase();
    }
  }

  const host = request.headers.get('host');
  if (host) {
    return host.split(',')[0].trim().toLowerCase();
  }

  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const resolveRequestTenant = (request?: Request) => {
  const hostname = resolveRequestHostname(request);
  return ENV_CONFIG.getTenant(hostname);
};

export const syncBetterAuthUser = async (
  user: Record<string, any>,
  context: any,
  options: { isNewUser?: boolean } = {}
) => {
  const request = context?.request || context?.context?.request;
  if (!(request instanceof Request)) return;
  const tenant = resolveRequestTenant(request);

  const { firstName, lastName } = splitName(user.name);

  // Better Auth's own ba_users table has no auth.users row of its own — but
  // several things structurally require one: user_roles/event_roles FK to
  // auth.users(id) directly (so Better-Auth-only accounts could never hold
  // an admin role), and the BSL general-pass provisioning trigger
  // (db/migrations/V010__provision_upcoming_bsl_general_passes.sql) only
  // fires on auth.users INSERT/UPDATE, so Better-Auth-only signups never
  // received their Chile/Colombia 2026 general passes. Bridging every
  // Better Auth user into a real (shadow) Supabase account here fixes both:
  // the pass trigger fires as a side effect of the row existing, and role
  // grants can target a real auth.users id — PROVIDED the resulting Supabase
  // uid is also recorded in the registry's provider_ids.supabase below,
  // since resolveSupabaseIdentityForUser (resolve-notification-identity.ts)
  // resolves a Better-Auth caller's supabaseUserId purely from that field —
  // admin/event-admin checks would keep failing without it even though the
  // shadow account exists. Runs on both create.after and update.after so a
  // user whose bridge failed on signup self-heals on their next profile
  // update, same as registryUserId's self-heal pattern. Never throws — a
  // Supabase-side failure here must not break the Better Auth sign-up.
  let supabaseUserId: string | null = null;
  const supabase = getSupabaseServerForRequest(request);
  try {
    const bridged = await ensureSupabaseAccountForEmail(supabase, {
      email: user.email,
      userMetadata: {
        auth_provider: 'better-auth',
        auth_bridge: 'better_auth_hook',
        full_name: user.name || null,
        avatar_url: user.image || null,
        better_auth_user_id: user.id,
      },
    });
    supabaseUserId = bridged?.id ?? null;
  } catch (error) {
    console.error(
      '[Better Auth] Supabase account bridge failed:',
      error instanceof Error ? error.message : String(error)
    );
  }

  await syncPublicUserRegistry(request, {
    provider: 'better-auth',
    authUserId: user.id,
    email: user.email,
    firstName,
    lastName,
    fullName: user.name || null,
    avatarUrl: user.image || null,
    role: user.role || 'user',
    status: user.banned ? 'banned' : 'active',
    emailVerifiedAt: user.emailVerified ? new Date().toISOString() : null,
    authMetadata: {
      auth_provider: 'better-auth',
      tenant: tenant.slug,
      tenant_domain: tenant.domain,
    },
    profileMetadata: {
      better_auth_user: user,
    },
    providerIds: {
      'better-auth': user.id,
      ...(supabaseUserId ? { supabase: supabaseUserId } : {}),
    },
  });

  // Fire on genuine account creation only (update.after also calls this
  // function on every profile sync, which would otherwise re-fire the
  // welcome email on each login) -- runs for every tenant, since Better
  // Auth Google sign-in is shared across hashpass.tech and bsl.hashpass.tech.
  // sendWelcomeEmailToNewUser is itself idempotent (has_email_been_sent
  // tracking), so this is a safe no-op if somehow called twice. Awaited
  // (not fire-and-forget) because Lambda may freeze the execution context
  // right after this hook's caller returns its response -- an unawaited
  // promise here could get silently killed mid-send/mid-mark on a cold
  // container. Still never throws past this function: a delivery failure
  // must not fail the Better Auth sign-up that already succeeded. Passes
  // the same request-scoped `supabase` client used above, not the global
  // core-production default, so BSL users are tracked/marked against the
  // Supabase project their auth.users row actually lives in.
  if (options.isNewUser && supabaseUserId && user.email) {
    try {
      await sendWelcomeEmailToNewUser(supabaseUserId, user.email, undefined, supabase);
    } catch (error) {
      console.error(
        '[Better Auth] Welcome email failed:',
        error instanceof Error ? error.message : String(error)
      );
    }
  }
};

const googleClientId = readEnv('BETTER_AUTH_GOOGLE_CLIENT_ID') || readEnv('GOOGLE_CLIENT_ID');
const googleClientSecret =
  readEnv('BETTER_AUTH_GOOGLE_CLIENT_SECRET') || readEnv('GOOGLE_CLIENT_SECRET');
const configuredBaseURL = normalizeAuthURL(readEnv('BETTER_AUTH_URL'));

const createAuthInstance = () =>
  betterAuth({
    appName: 'HASHPASS Auth',
    basePath: AUTH_BASE_PATH,
    user: {
      modelName: 'ba_users',
    },
    ...(configuredBaseURL
      ? { baseURL: configuredBaseURL }
      : {
          baseURL: {
            allowedHosts: [...DEFAULT_ALLOWED_HOSTS, ...readListEnv('BETTER_AUTH_ALLOWED_HOSTS')],
          },
        }),
    database: getDatabasePool(),
    trustedOrigins: [
      ...DEFAULT_TRUSTED_ORIGINS,
      ...readListEnv('BETTER_AUTH_TRUSTED_ORIGINS'),
    ],
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user, context) => {
            await syncBetterAuthUser(user, context, { isNewUser: true });
          },
        },
        update: {
          after: async (user, context) => {
            await syncBetterAuthUser(user, context);
          },
        },
      },
    },
  });

type BetterAuthInstance = ReturnType<typeof createAuthInstance>;

let authInstance: BetterAuthInstance | null = null;

export const getAuth = (): BetterAuthInstance | null => {
  if (authInstance) {
    return authInstance;
  }

  if (!hasDatabaseConnectionString()) {
    return null;
  }

  authInstance = createAuthInstance();
  return authInstance;
};

const createMissingAuthHandler = (): BetterAuthInstance['handler'] =>
  async () =>
    new Response(
      JSON.stringify({
        error:
          'Better Auth database is not configured in this environment. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, or DATABASE_URL to enable /api/auth.',
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );

export const getAuthHandler = (): BetterAuthInstance['handler'] => {
  const auth = getAuth();
  return auth ? auth.handler : createMissingAuthHandler();
};

export type BetterAuthSessionUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  status?: string;
};

// Verifies the caller's Better Auth session cookie directly against this
// app's own Better Auth instance, in-process (no network hop) — deliberately
// bypasses @hashpass/auth's authenticateRequest(), which routes by tenant
// hostname (packages/config/src/sso-config.ts's core tenant still has the
// stale authProvider: 'directus'). Better Auth is now the Google sign-in path
// for every tenant including core (see AUTH_FLOW.md), so a hostname-routed
// check would require a Bearer token and 401 a Better-Auth-only caller on
// hashpass.tech before ever looking at their session cookie. Any endpoint
// whose caller is known in advance to be a Better Auth session (like the
// supabase-bridge endpoint) should use this instead of authenticateRequest().
export const getBetterAuthSessionUser = async (
  request: Request
): Promise<BetterAuthSessionUser | null> => {
  const cookie = request.headers.get('cookie') || request.headers.get('Cookie') || '';
  if (!cookie) return null;

  try {
    const url = new URL(request.url);
    const sessionRequest = new Request(new URL('/api/auth/get-session', url.origin).toString(), {
      method: 'GET',
      headers: {
        Cookie: cookie,
        Accept: 'application/json',
        'x-forwarded-host': request.headers.get('x-forwarded-host') || request.headers.get('host') || '',
        'x-forwarded-proto': request.headers.get('x-forwarded-proto') || 'https',
      },
    });

    const response = await getAuthHandler()(sessionRequest);
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const betterAuthUser = payload?.user || payload?.data?.user;
    if (!betterAuthUser?.id) return null;

    const [firstName, ...lastNameParts] = String(betterAuthUser.name || '').trim().split(/\s+/);
    return {
      id: betterAuthUser.id,
      email: betterAuthUser.email || '',
      first_name: betterAuthUser.first_name || betterAuthUser.firstName || firstName || '',
      last_name: betterAuthUser.last_name || betterAuthUser.lastName || lastNameParts.join(' '),
      role: betterAuthUser.role || 'user',
      status: betterAuthUser.banned ? 'banned' : 'active',
    };
  } catch (error) {
    console.error('[Better Auth] Direct session verification failed:', error instanceof Error ? error.message : String(error));
    return null;
  }
};
