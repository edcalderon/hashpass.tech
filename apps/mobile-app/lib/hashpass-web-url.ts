import { Platform } from 'react-native';
import { readBuildEnvironment } from './api-client';

// Mirrors REMOTE_API_BASE_BY_ENV in api-client.ts -- dev.hashpass.tech and
// hashpass.tech are the two real, separately-deployed environments for this
// app's own web export (hashpass-dev-site-build / hashpass-prod-site-build
// CodeBuild projects), same environment signal already used to pick the API
// base URL.
const WEB_APP_ORIGIN_BY_ENV = {
  development: 'https://dev.hashpass.tech',
  production: 'https://hashpass.tech',
} as const;

/**
 * The origin (scheme + host) this app's own web pages -- /terms, /privacy,
 * /delete-account -- actually live at for the CURRENT runtime, not a
 * hardcoded production URL. On web this is trivially window.location.origin
 * (local dev, dev.hashpass.tech, and hashpass.tech are all automatically
 * correct with no env lookup needed, since the app IS that page). On native,
 * where there's no "current origin", falls back to the same build-profile
 * signal api-client.ts uses to pick between api-dev/api base URLs.
 */
export function getHashpassWebOrigin(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  const environment = readBuildEnvironment() || 'production';
  return WEB_APP_ORIGIN_BY_ENV[environment];
}
