import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';

export type OtaUpdateState = 'unsupported' | 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

const FOREGROUND_RECHECK_MS = 5 * 60 * 1000;

/**
 * Checks and downloads compatible EAS updates while the app is safe to use.
 * Applying is deliberately left to the caller: restarting an attendee in the
 * middle of a meeting flow is worse than asking them to restart once ready.
 */
export function useOtaUpdate() {
  const [state, setState] = useState<OtaUpdateState>(Platform.OS === 'web' ? 'unsupported' : 'idle');
  const lastCheckAt = useRef(0);

  const checkForUpdate = useCallback(async (force = false) => {
    if (Platform.OS === 'web' || !Updates.isEnabled) return false;
    if (!force && Date.now() - lastCheckAt.current < FOREGROUND_RECHECK_MS) return false;

    lastCheckAt.current = Date.now();
    setState('checking');
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) {
        setState('idle');
        return false;
      }

      setState('downloading');
      const fetched = await Updates.fetchUpdateAsync();
      if (fetched.isNew) {
        setState('ready');
        return true;
      }

      setState('idle');
      return false;
    } catch {
      // OTA delivery is opportunistic. A network failure must never interrupt
      // event access; the next foreground transition retries it.
      setState('error');
      return false;
    }
  }, []);

  const applyUpdate = useCallback(async () => {
    if (Platform.OS === 'web' || state !== 'ready') return;
    await Updates.reloadAsync();
  }, [state]);

  useEffect(() => {
    void checkForUpdate(true);
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void checkForUpdate();
    });
    return () => subscription.remove();
  }, [checkForUpdate]);

  return { state, checkForUpdate, applyUpdate };
}
