import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

export const nativeGoogleSigninStatusCodes = statusCodes;

const createNativeGoogleSigninError = (message: string, code: string) => {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
};

export async function configureNativeGoogleSignin(webClientId?: string | null): Promise<void> {
  if (!webClientId) {
    return;
  }

  try {
    GoogleSignin.configure({
      webClientId,
      offlineAccess: false,
    });
  } catch (error) {
    console.warn('[GoogleSignin] configure() failed:', error);
  }
}

export async function clearNativeGoogleAccount(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    // Non-critical. Continue with app sign-out or cache clearing.
  }
}

export async function signInWithNativeGoogleAccount(): Promise<{ idToken: string }> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (error: any) {
    throw createNativeGoogleSigninError(
      error?.message || 'Google Play Services are unavailable on this device.',
      error?.code || statusCodes.PLAY_SERVICES_NOT_AVAILABLE
    );
  }

  let response: unknown;
  try {
    response = await GoogleSignin.signIn();
  } catch (error: any) {
    throw createNativeGoogleSigninError(
      error?.message || 'Google Sign-In was cancelled or could not be started.',
      error?.code || 'GOOGLE_SIGN_IN_FAILED'
    );
  }

  const idToken =
    (response as any)?.data?.idToken ??
    (response as any)?.idToken ??
    null;

  if (!idToken) {
    const responseType = (response as any)?.type ?? 'unknown';
    const isCancelled =
      responseType === 'cancelled' ||
      responseType === 'cancel' ||
      responseType === statusCodes.SIGN_IN_CANCELLED;
    throw createNativeGoogleSigninError(
      isCancelled
        ? 'Google Sign-In was cancelled.'
        : `Google Sign-In did not return an ID token (response type: ${responseType}).`,
      isCancelled ? statusCodes.SIGN_IN_CANCELLED : 'GOOGLE_ID_TOKEN_MISSING'
    );
  }

  return { idToken };
}
