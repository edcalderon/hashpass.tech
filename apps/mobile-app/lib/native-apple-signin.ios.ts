import * as AppleAuthentication from 'expo-apple-authentication';

type NativeAppleSignInError = Error & { code: string };

const appleSignInError = (code: string, message: string): NativeAppleSignInError =>
  Object.assign(new Error(message), { code });

export const signInWithNativeAppleAccount = async (): Promise<{ identityToken: string }> => {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw appleSignInError(
      'APPLE_SIGN_IN_UNAVAILABLE',
      'Sign in with Apple is unavailable in this app build. Install the latest signed iOS build and try again.'
    );
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw appleSignInError(
      'APPLE_ID_TOKEN_MISSING',
      'Apple sign-in did not return an identity token. Please try again.'
    );
  }

  return { identityToken: credential.identityToken };
};
