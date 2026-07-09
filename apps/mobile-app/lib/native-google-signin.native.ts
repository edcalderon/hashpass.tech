type NativeGoogleSigninModule = {
  GoogleSignin: {
    configure: (options: { webClientId: string; offlineAccess: boolean }) => void;
    hasPlayServices: (options: { showPlayServicesUpdateDialog: boolean }) => Promise<boolean>;
    signIn: () => Promise<unknown>;
    signOut: () => Promise<unknown>;
  };
  statusCodes?: Record<string, string>;
};

export const nativeGoogleSigninStatusCodes: Record<string, string> = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  NULL_PRESENTER: 'NULL_PRESENTER',
};

const createNativeGoogleSigninError = (message: string, code: string) => {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
};

let nativeGoogleSigninModule: NativeGoogleSigninModule | null = null;

const getNativeGoogleSigninModule = (): NativeGoogleSigninModule => {
  if (nativeGoogleSigninModule) {
    return nativeGoogleSigninModule;
  }

  try {
    // Lazy-load so auth screen mount does not crash if the native TurboModule is
    // absent in an older/dev build. The caller can then fall back to browser OAuth.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loadedModule = require('@react-native-google-signin/google-signin') as NativeGoogleSigninModule;
    if (!loadedModule?.GoogleSignin) {
      throw new Error('RNGoogleSignin native module was not exported.');
    }

    nativeGoogleSigninModule = loadedModule;
    Object.assign(nativeGoogleSigninStatusCodes, loadedModule.statusCodes || {});
    return loadedModule;
  } catch (error: any) {
    throw createNativeGoogleSigninError(
      error?.message
        ? `Native Google Sign-In is unavailable: ${error.message}`
        : 'Native Google Sign-In is unavailable in this build.',
      'GOOGLE_SIGN_IN_UNAVAILABLE'
    );
  }
};

export async function configureNativeGoogleSignin(webClientId?: string | null): Promise<void> {
  if (!webClientId) {
    return;
  }

  try {
    const { GoogleSignin } = getNativeGoogleSigninModule();
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
    const { GoogleSignin } = getNativeGoogleSigninModule();
    await GoogleSignin.signOut();
  } catch {
    // Non-critical. Continue with app sign-out or cache clearing.
  }
}

export async function signInWithNativeGoogleAccount(
  webClientId?: string | null
): Promise<{ idToken: string }> {
  const { GoogleSignin } = getNativeGoogleSigninModule();

  if (webClientId) {
    await configureNativeGoogleSignin(webClientId);
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (error: any) {
    throw createNativeGoogleSigninError(
      error?.message || 'Google Play Services are unavailable on this device.',
      error?.code || nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE
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
      responseType === nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED;
    throw createNativeGoogleSigninError(
      isCancelled
        ? 'Google Sign-In was cancelled.'
        : `Google Sign-In did not return an ID token (response type: ${responseType}).`,
      isCancelled ? nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED : 'GOOGLE_ID_TOKEN_MISSING'
    );
  }

  return { idToken };
}
