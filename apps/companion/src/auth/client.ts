import { createAuthClient } from 'better-auth/client';

const DEV_AUTH_URL = 'https://api-dev.hashpass.tech/api/auth';
const PRODUCTION_AUTH_URL = 'https://api.hashpass.tech/api/auth';
const REQUEST_TIMEOUT_MS = 7000;

let client: ReturnType<typeof createAuthClient> | null = null;

function readEnv(name: 'VITE_BETTER_AUTH_URL' | 'VITE_BETTER_AUTH_CALLBACK_URL'): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getCompanionAuthBaseUrl(): string {
  return (readEnv('VITE_BETTER_AUTH_URL') || (import.meta.env.DEV ? DEV_AUTH_URL : PRODUCTION_AUTH_URL)).replace(/\/$/, '');
}

export function getCompanionAuthCallbackUrl(): string {
  const configured = readEnv('VITE_BETTER_AUTH_CALLBACK_URL');
  if (configured) return configured;

  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function getCompanionAuthClient() {
  if (!client) {
    client = createAuthClient({
      baseURL: getCompanionAuthBaseUrl(),
      fetchOptions: {
        credentials: 'include',
        timeout: REQUEST_TIMEOUT_MS,
      },
    });
  }
  return client;
}
