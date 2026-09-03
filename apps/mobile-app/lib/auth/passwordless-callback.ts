/**
 * Browser-storage marker used only to route a just-requested Supabase
 * passwordless callback. It prevents an abandoned Google sign-in marker from
 * sending a magic-link callback through Better Auth's cookie flow.
 */
export const PASSWORDLESS_CALLBACK_MARKER = 'supabase_passwordless_in_progress';

type PasswordlessCallbackParams = {
  signInMethod?: string | null;
  passwordlessRequestInProgress?: boolean;
  code?: unknown;
  tokenHash?: unknown;
  token?: unknown;
  email?: unknown;
  hasImplicitAccessToken?: boolean;
};

type BetterAuthGoogleCallbackParams = {
  signInMethod?: string | null;
  oauthInProgress?: boolean;
};

export const isSupabasePasswordlessCallback = ({
  signInMethod,
  passwordlessRequestInProgress = false,
  code,
  tokenHash,
  token,
  email,
  hasImplicitAccessToken = false,
}: PasswordlessCallbackParams): boolean =>
  signInMethod === 'magic_link' ||
  signInMethod === 'otp_code' ||
  passwordlessRequestInProgress ||
  Boolean(code) ||
  Boolean(tokenHash) ||
  Boolean(token && email) ||
  hasImplicitAccessToken;

/**
 * Better Auth's Google callback has no query payload because the backend has
 * already consumed it and set a same-site session cookie. Do not select that
 * path based solely on the historical sign-in-method marker: magic-link
 * emails can be opened later or in another browser context where that marker
 * is stale or absent.
 */
export const isBetterAuthGoogleCallback = ({
  signInMethod,
  oauthInProgress = false,
}: BetterAuthGoogleCallbackParams): boolean =>
  signInMethod === 'google_oauth' && oauthInProgress;
