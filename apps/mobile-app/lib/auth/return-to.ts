const DEFAULT_RETURN_TO = '/dashboard/explore';

export const normalizeSafeReturnToPath = (rawPath: string): string => {
  // Router query parameters are already decoded once. Preserve percent-encoded
  // nested values so signed OAuth continuations remain byte-for-byte intact.
  let normalized = rawPath.replace(/^[\x00-\x20]+/, '');

  // Reject absolute, protocol-relative, and backslash-based browser redirects.
  if (!/^\/[^/\\]/.test(normalized)) return DEFAULT_RETURN_TO;

  normalized = normalized.replace(/\/\([^/]+\)/g, '');
  if (!normalized || normalized === '/auth' || normalized.includes('/auth/callback')) {
    return DEFAULT_RETURN_TO;
  }

  return normalized;
};
