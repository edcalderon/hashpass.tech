import { Platform } from 'react-native';
import { resolveGoogleOAuthClientId } from './auth/oauth/google-credentials';

const parseBooleanFlag = (value: string | undefined): boolean | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  return null;
};

export const shouldUseNativeGoogleSignin = (webClientId?: string | null): boolean => {
  if (Platform.OS === 'web') {
    return false;
  }

  const resolvedWebClientId = (webClientId || resolveGoogleOAuthClientId()).trim();
  if (!resolvedWebClientId) {
    return false;
  }

  const explicitFlag = parseBooleanFlag(process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN);

  if (explicitFlag === false) {
    return false;
  }

  // Native builds should use the SDK account-picker flow by default. The flag
  // remains available only as an emergency diagnostic override for local builds.
  return true;
};
