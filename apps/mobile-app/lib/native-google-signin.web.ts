export const nativeGoogleSigninStatusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
} as const;

export async function configureNativeGoogleSignin(
  _webClientId?: string | null
): Promise<void> {
  return;
}

export async function clearNativeGoogleAccount(): Promise<void> {
  return;
}

export async function signInWithNativeGoogleAccount(
  _webClientId?: string | null
): Promise<{ idToken: string }> {
  throw new Error('Native Google Sign-In is not available on web.');
}
