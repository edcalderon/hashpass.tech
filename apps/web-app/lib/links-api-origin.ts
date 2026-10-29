const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Use the dev server's browser-visible host for local API calls from LAN devices. */
export function getLinksApiOrigin(): string {
  const configuredOrigin = (process.env.NEXT_PUBLIC_LINKS_API_BASE_URL || '').replace(/\/+$/, '');
  if (!configuredOrigin || process.env.NODE_ENV !== 'development' || typeof window === 'undefined') {
    return configuredOrigin;
  }

  try {
    const apiUrl = new URL(configuredOrigin);
    const pageHost = window.location.hostname;
    if (LOOPBACK_HOSTS.has(apiUrl.hostname) && !LOOPBACK_HOSTS.has(pageHost)) {
      apiUrl.hostname = pageHost;
    }
    return apiUrl.toString().replace(/\/+$/, '');
  } catch {
    return configuredOrigin;
  }
}
