import { getAuthHandler } from './better-auth';
import {
  createBetterAuthErrorRedirect,
  rewriteBetterAuthErrorRedirect,
} from './better-auth-error-redirect';

const betterAuthHandler = getAuthHandler();
const APPLE_CALLBACK_FIELDS = [
  'code',
  'error',
  'device_id',
  'error_description',
  'state',
  'user',
  'iss',
] as const;

const isAppleFormPostCallback = (request: Request): boolean => {
  if (request.method !== 'POST') return false;

  const url = new URL(request.url);
  if (!/\/callback\/apple\/?$/i.test(url.pathname)) return false;

  return request.headers
    .get('content-type')
    ?.toLowerCase()
    .includes('application/x-www-form-urlencoded') ?? false;
};

/**
 * Apple sends its OAuth response as a top-level form POST. The Expo request
 * adapter running behind API Gateway currently drops urlencoded callback
 * fields before Better Auth reads its body, causing Better Auth to redirect to
 * a second callback request without `state` and fail with `state_not_found`.
 *
 * Parse that form at the route boundary and hand Better Auth the equivalent
 * GET request. This mirrors Better Auth's own form_post normalization while
 * preserving the OAuth state and Apple's optional one-time `user` payload.
 */
const normalizeAppleFormPostCallback = async (request: Request): Promise<Request> => {
  if (!isAppleFormPostCallback(request)) return request;

  const formData = new URLSearchParams(await request.text());
  const callbackUrl = new URL(request.url);

  for (const key of APPLE_CALLBACK_FIELDS) {
    const value = formData.get(key);
    if (typeof value === 'string') {
      callbackUrl.searchParams.set(key, value);
    }
  }

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('content-type');

  return new Request(callbackUrl.toString(), {
    method: 'GET',
    headers,
  });
};

const handler: typeof betterAuthHandler = async (...args: Parameters<typeof betterAuthHandler>) => {
  const request = await normalizeAppleFormPostCallback(args[0] as Request);
  const errorRedirect = createBetterAuthErrorRedirect(request);
  if (errorRedirect) return errorRedirect;

  const response = await betterAuthHandler(
    request,
    ...args.slice(1),
  );
  return rewriteBetterAuthErrorRedirect(request, response);
};

// OAUTH_METADATA_GET is re-exported by the RFC 8414 issuer-path discovery
// route; keeping one handler preserves identical host/origin validation.
export { handler as GET, handler as POST, handler as OAUTH_METADATA_GET };
