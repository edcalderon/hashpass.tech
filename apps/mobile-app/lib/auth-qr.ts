// HashPass Auth QR payload detection: a browser signing in at hashpass.club
// (or any other HashPass Auth relying party) shows a QR code whose value is
// the challenge's `qrUrl` -- e.g. `https://hashpass.link/auth/<challengeId>`
// -- returned by packages/hashpass-links-api's `POST /api/v1/auth/qr/challenges`.
// This intentionally does not assume a specific host: hashpass.link's
// DNS/infra isn't live yet, so the app may be pointed at a temporary API
// Gateway URL or a -dev subdomain (EXPO_PUBLIC_LINKS_API_BASE_URL). When that
// env var is set, scans are also checked against its origin for a tighter
// match; otherwise only the /auth/<id> path shape is required.
const AUTH_QR_PATH = /^\/auth\/([A-Za-z0-9_-]+)\/?$/;

export function parseAuthQrScan(data: string): { challengeId: string } | null {
  let url: URL;
  try {
    url = new URL(data);
  } catch {
    return null;
  }

  const match = url.pathname.match(AUTH_QR_PATH);
  if (!match) return null;

  const configuredBase = process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;
  if (configuredBase) {
    try {
      if (new URL(configuredBase).origin !== url.origin) return null;
    } catch {
      // Malformed config -- fall through to the permissive path-only match
      // rather than silently refusing every scan.
    }
  }

  return { challengeId: match[1] };
}
