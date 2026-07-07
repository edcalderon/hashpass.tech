import { Platform } from 'react-native';

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

  if (!webClientId || !webClientId.trim()) {
    return false;
  }

  const explicitFlag = parseBooleanFlag(process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN);
  if (explicitFlag === false) {
    return false;
  }

  // Native Google Sign-In should be the default on mobile so the SDK path is used
  // unless a release explicitly disables it.
  return true;
};
