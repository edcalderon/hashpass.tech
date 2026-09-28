export type BetterAuthSessionUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  status?: string;
};

const TRUSTED_API_HOSTS = new Set([
  'api.hashpass.tech',
  'api-dev.hashpass.tech',
  'localhost',
  '127.0.0.1',
]);
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1']);

const resolveSessionURL = (request: Request): URL | null => {
  const configured = (
    process.env.BETTER_AUTH_URL ||
    process.env.EXPO_PUBLIC_BETTER_AUTH_URL ||
    ''
  ).trim();

  if (configured) {
    try {
      const base = new URL(configured);
      if (base.protocol !== 'https:' && !LOCAL_API_HOSTS.has(base.hostname)) {
        return null;
      }
      return new URL(`${base.pathname.replace(/\/$/, '')}/get-session`, base.origin);
    } catch {
      return null;
    }
  }

  try {
    const incoming = new URL(request.url);
    if (!TRUSTED_API_HOSTS.has(incoming.hostname)) return null;
    return new URL('/api/auth/get-session', incoming.origin);
  } catch {
    return null;
  }
};

/**
 * Validate a Better Auth browser session through the canonical auth route.
 *
 * Keeping this client independent from `better-auth.ts` prevents every
 * authenticated API route from embedding the full Better Auth + MCP runtime.
 * The target is restricted to the configured auth URL or known Hashpass API
 * hosts so an attacker-controlled Host header cannot turn this into SSRF.
 */
export const getBetterAuthSessionUser = async (
  request: Request,
): Promise<BetterAuthSessionUser | null> => {
  const cookie = request.headers.get('cookie') || request.headers.get('Cookie') || '';
  if (!cookie) return null;

  const sessionURL = resolveSessionURL(request);
  if (!sessionURL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(sessionURL, {
      method: 'GET',
      headers: {
        Cookie: cookie,
        Accept: 'application/json',
      },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const payload = await response.json().catch(() => null);
    const user = payload?.user || payload?.data?.user;
    if (!user?.id) return null;

    const [firstName, ...lastNameParts] = String(user.name || '').trim().split(/\s+/);
    return {
      id: user.id,
      email: user.email || '',
      first_name: user.first_name || user.firstName || firstName || '',
      last_name: user.last_name || user.lastName || lastNameParts.join(' '),
      role: user.role || 'user',
      status: user.banned ? 'banned' : 'active',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};
