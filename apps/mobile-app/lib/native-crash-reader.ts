import { NativeModules, Platform, Alert } from 'react-native';

/**
 * Read crash log written by withAndroidCrashReporter config plugin.
 * Shows an Alert if a crash was recorded since last launch, then clears it.
 */
export async function checkNativeCrashLog(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;

  try {
    const { SharedPreferencesAndroid } = NativeModules;
    if (!SharedPreferencesAndroid) return null;

    const crash = await SharedPreferencesAndroid.getItem('native_crash_log', 'last_crash');
    if (!crash) return null;

    // Clear so we don't show it repeatedly
    await SharedPreferencesAndroid.removeItem('native_crash_log', 'last_crash');

    return crash as string;
  } catch {
    return null;
  }
}

export function showNativeCrashAlert(crash: string): void {
  Alert.alert(
    'Native Crash (previous launch)',
    crash.slice(0, 1000),
    [{ text: 'OK' }]
  );
}
