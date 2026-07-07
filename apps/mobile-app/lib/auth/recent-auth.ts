const AUTH_RECENT_SUCCESS_KEY = 'auth_recent_success_at';
const AUTH_REDIRECT_GRACE_MS = 12_000;

type RecentAuthGlobal = typeof globalThis & {
  __HASHPASS_RECENT_AUTH_SUCCESS_AT__?: number;
};

const getGlobalState = (): RecentAuthGlobal => globalThis as RecentAuthGlobal;

const getSessionStorage = (): Storage | null => {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return null;
  }

  return window.sessionStorage;
};

const readTimestamp = (raw: string | null | undefined): number | null => {
  if (!raw) return null;

  const timestamp = Number(raw);
  if (!Number.isFinite(timestamp)) return null;

  return timestamp;
};

const isWithinGracePeriod = (timestamp: number): boolean => Date.now() - timestamp <= AUTH_REDIRECT_GRACE_MS;

export const markRecentAuthSuccess = (): void => {
  const timestamp = Date.now();
  getGlobalState().__HASHPASS_RECENT_AUTH_SUCCESS_AT__ = timestamp;

  const sessionStorage = getSessionStorage();
  if (sessionStorage) {
    sessionStorage.setItem(AUTH_RECENT_SUCCESS_KEY, String(timestamp));
  }
};

export const clearRecentAuthSuccess = (): void => {
  delete getGlobalState().__HASHPASS_RECENT_AUTH_SUCCESS_AT__;

  const sessionStorage = getSessionStorage();
  if (sessionStorage) {
    sessionStorage.removeItem(AUTH_RECENT_SUCCESS_KEY);
  }
};

export const hasRecentAuthSuccess = (): boolean => {
  const sessionStorage = getSessionStorage();
  const storageTimestamp = readTimestamp(sessionStorage?.getItem(AUTH_RECENT_SUCCESS_KEY) || null);
  if (storageTimestamp !== null) {
    if (isWithinGracePeriod(storageTimestamp)) {
      getGlobalState().__HASHPASS_RECENT_AUTH_SUCCESS_AT__ = storageTimestamp;
      return true;
    }

    clearRecentAuthSuccess();
    return false;
  }

  const globalTimestamp = getGlobalState().__HASHPASS_RECENT_AUTH_SUCCESS_AT__;
  if (typeof globalTimestamp === 'number' && Number.isFinite(globalTimestamp)) {
    if (isWithinGracePeriod(globalTimestamp)) {
      return true;
    }

    clearRecentAuthSuccess();
  }

  return false;
};

export const AUTH_REDIRECT_GRACE_WINDOW_MS = AUTH_REDIRECT_GRACE_MS;
