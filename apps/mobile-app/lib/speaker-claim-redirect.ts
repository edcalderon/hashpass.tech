import { Platform } from 'react-native';
import {
  getSupabaseMagicLinkCallbackPath,
  getSupabaseOAuthRedirectUrl,
  SUPABASE_OAUTH_CALLBACK_PATH,
} from '@hashpass/auth';

/** Query flag the speaker page uses to finish verifying a claimed email. */
export const CLAIM_VERIFY_PARAM = 'claimVerify';

export const speakerClaimReturnPath = (eventSlug: string, speakerId: string) =>
  `/events/${encodeURIComponent(eventSlug)}/speakers/${encodeURIComponent(speakerId)}?${CLAIM_VERIFY_PARAM}=1`;

/**
 * Callback URL embedded in the verification email. Mirrors the sign-in screen:
 * React Native reports a null/localhost origin, which is unusable in an email,
 * so those fall back to the configured site origin.
 */
export const buildClaimVerificationRedirect = (returnTo: string): string => {
  const nativeRelay = Platform.OS !== 'web';
  const rawOrigin = typeof window !== 'undefined' ? window.location?.origin : undefined;
  const unusable = !rawOrigin || rawOrigin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(rawOrigin);

  let callbackPath = getSupabaseMagicLinkCallbackPath({ returnTo });
  if (nativeRelay) {
    const params = new URLSearchParams();
    params.set('returnTo', returnTo);
    params.set('nativeRelay', '1');
    callbackPath = `${SUPABASE_OAUTH_CALLBACK_PATH}?${params.toString()}`;
  }
  return getSupabaseOAuthRedirectUrl({
    callbackPath,
    origin: unusable ? undefined : rawOrigin,
    relayToNative: nativeRelay,
  });
};
