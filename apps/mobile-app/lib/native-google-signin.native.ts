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

const normalizeNativeGoogleSigninCode = (code: unknown, fallback: string): string => {
  if (typeof code === 'string' && code.trim()) {
    return code;
  }
  if (typeof code === 'number') {
    return String(code);
  }
  return fallback;
};

const getNativeGoogleSigninErrorDetails = (error: any, fallbackCode: string) => ({
  code: normalizeNativeGoogleSigninCode(error?.code, fallbackCode),
  message: error?.message || String(error || 'Unknown native Google Sign-In error'),
  name: error?.name || 'Error',
});

const createNativeGoogleSigninError = (message: string, code: unknown) => {
  const error = new Error(message);
  (error as Error & { code?: string }).code = normalizeNativeGoogleSigninCode(
    code,
    'GOOGLE_SIGN_IN_FAILED'
  );
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
    console.warn('[GoogleSignin] Native module unavailable:', getNativeGoogleSigninErrorDetails(
      error,
      'GOOGLE_SIGN_IN_UNAVAILABLE'
    ));
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
  } catch (error: any) {
    console.warn('[GoogleSignin] configure() failed:', getNativeGoogleSigninErrorDetails(
      error,
      'GOOGLE_CONFIGURE_FAILED'
    ));
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
    const hasPlayServices = await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (!hasPlayServices) {
      throw createNativeGoogleSigninError(
        'Google Play Services are unavailable on this device.',
        nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE
      );
    }
  } catch (error: any) {
    if (error?.code === nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      console.warn('[GoogleSignin] Play Services unavailable:', getNativeGoogleSigninErrorDetails(
        error,
        nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE
      ));
      throw error;
    }

    console.warn('[GoogleSignin] Play Services check failed:', getNativeGoogleSigninErrorDetails(
      error,
      nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE
    ));
    throw createNativeGoogleSigninError(
      error?.message || 'Google Play Services are unavailable on this device.',
      error?.code || nativeGoogleSigninStatusCodes.PLAY_SERVICES_NOT_AVAILABLE
    );
  }

  let response: unknown;
  try {
    response = await GoogleSignin.signIn();
  } catch (error: any) {
    console.warn('[GoogleSignin] signIn() failed:', getNativeGoogleSigninErrorDetails(
      error,
      'GOOGLE_SIGN_IN_FAILED'
    ));
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
    console.warn('[GoogleSignin] signIn() returned no ID token:', {
      responseType,
      isCancelled,
    });
    throw createNativeGoogleSigninError(
      isCancelled
        ? 'Google Sign-In was cancelled.'
        : `Google Sign-In did not return an ID token (response type: ${responseType}).`,
      isCancelled ? nativeGoogleSigninStatusCodes.SIGN_IN_CANCELLED : 'GOOGLE_ID_TOKEN_MISSING'
    );
  }

  return { idToken };
}
