// TypeScript's non-platform-aware resolver uses this fallback. Metro selects
// native-apple-signin.ios.ts on iOS, .native.ts on Android, and .web.ts on web.
type NativeAppleSignInError = Error & { code: string };

export const signInWithNativeAppleAccount = async (): Promise<{ identityToken: string }> => {
  throw Object.assign(
    new Error('Native Sign in with Apple is only available on iOS.'),
    { code: 'APPLE_SIGN_IN_UNAVAILABLE' }
  ) as NativeAppleSignInError;
};
