// Mirrors the key set of native-google-signin.native.ts's status codes object
// (not just the two web previously declared here) so tsc — which resolves the
// bare `./native-google-signin` import to this web stub, since it has no
// platform-extension-aware module resolution — actually type-checks native-only
// status-code comparisons in useAuth.ts instead of silently allowing typos.
// This path never executes on web (signInWithNativeGoogleAccount always throws
// below), so the values are unreachable placeholders.
export const nativeGoogleSigninStatusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  NULL_PRESENTER: 'NULL_PRESENTER',
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
