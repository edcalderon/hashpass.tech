export const nativeGoogleSigninStatusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
} as const;

export async function configureNativeGoogleSignin(): Promise<void> {
  return;
}

export async function clearNativeGoogleAccount(): Promise<void> {
  return;
}

export async function signInWithNativeGoogleAccount(): Promise<{ idToken: string }> {
  throw new Error('Native Google Sign-In is not available on web.');
}
