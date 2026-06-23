import { useState, useEffect } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { compareAppVersions } from '../config/runtime-version';
import packageJson from '../package.json';

export type NativeUpdateStatus = {
  needsHardUpdate: boolean;
  needsSoftUpdate: boolean;
  latestVersion: string | null;
  minimumVersion: string | null;
  storeUrl: string | null;
  storeWebUrl: string | null;
};

const INITIAL_STATE: NativeUpdateStatus = {
  needsHardUpdate: false,
  needsSoftUpdate: false,
  latestVersion: null,
  minimumVersion: null,
  storeUrl: null,
  storeWebUrl: null,
};

function getVersionsApiUrl(): string {
  // Use the API Lambda subdomain, not the Amplify SPA frontend
  const apiBase = __DEV__
    ? 'https://api-dev.hashpass.tech/api'
    : 'https://api.hashpass.tech/api';
  return `${apiBase}/config/versions`;
}

async function fetchUpdateStatus(): Promise<NativeUpdateStatus> {
  const currentVersion = packageJson.version;
  const url = `${getVersionsApiUrl()}?clientVersion=${encodeURIComponent(currentVersion)}`;

  const res = await fetch(url, {
    headers: { 'X-Client-Version': currentVersion },
    cache: 'no-store',
  });
  if (!res.ok) return INITIAL_STATE;

  const data = await res.json();

  const latestVersion: string | null = data.currentVersion ?? null;
  const minimumVersion: string | null = data.minimumVersion ?? null;
  const storeUrl: string | null =
    Platform.OS === 'android'
      ? (data.androidStoreUrl ?? null)
      : (data.iosStoreUrl ?? null);
  const storeWebUrl: string | null =
    Platform.OS === 'android'
      ? (data.androidStoreWebUrl ?? null)
      : (data.iosStoreWebUrl ?? null);

  const needsHardUpdate =
    minimumVersion != null
      ? compareAppVersions(currentVersion, minimumVersion) < 0
      : false;

  const needsSoftUpdate =
    !needsHardUpdate && latestVersion != null
      ? compareAppVersions(currentVersion, latestVersion) < 0
      : false;

  return { needsHardUpdate, needsSoftUpdate, latestVersion, minimumVersion, storeUrl, storeWebUrl };
}

export function useNativeUpdateCheck(): NativeUpdateStatus {
  const [status, setStatus] = useState<NativeUpdateStatus>(INITIAL_STATE);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;

    const check = async () => {
      try {
        const result = await fetchUpdateStatus();
        if (!cancelled) setStatus(result);
      } catch {
        // Network errors never block the app
      }
    };

    check();

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') check();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return status;
}
