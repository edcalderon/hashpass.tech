// RFC 8414 inserts `/.well-known/oauth-authorization-server` before an
// issuer path. Forward that canonical discovery URL to the same Better Auth
// handler that serves `/api/auth/*`.
export { OAUTH_METADATA_GET as GET } from '../../../../lib/server/better-auth-route';
