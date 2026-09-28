// RFC 8414 inserts `/.well-known/oauth-authorization-server` before an
// issuer path. Forward that canonical discovery URL to the same Better Auth
// handler that serves `/api/auth/*`.
import { OAUTH_METADATA_GET } from '../../../../lib/server/better-auth-route';

const CANONICAL_DISCOVERY_PATH = '/.well-known/oauth-authorization-server/api/auth';
const BETTER_AUTH_DISCOVERY_PATH = '/api/auth/.well-known/oauth-authorization-server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.pathname === CANONICAL_DISCOVERY_PATH) {
    url.pathname = BETTER_AUTH_DISCOVERY_PATH;
  }

  return OAUTH_METADATA_GET(new Request(url, request));
}
