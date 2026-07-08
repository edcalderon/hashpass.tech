import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';

export const nativeGoogleSigninStatusCodes = statusCodes;

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
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();

  const idToken =
    (response as any)?.data?.idToken ??
    (response as any)?.idToken ??
    null;

  if (!idToken) {
    const responseType = (response as any)?.type ?? 'unknown';
    throw new Error(`Google Sign-In did not return an ID token (response type: ${responseType}).`);
  }

  return { idToken };
}
