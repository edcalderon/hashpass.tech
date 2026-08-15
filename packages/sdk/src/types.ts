import type { AuthSessionStore } from "./auth/types.js";

export type HashpassEnvironment = "production" | "development" | "local";

export interface HashpassSdkOptions {
  /** Public application identifier issued by Hashpass. Never put a client secret here. */
  appId: string;
  environment?: HashpassEnvironment | undefined;
  baseUrl?: string | undefined;
  /** Base URL of the HashPass Links API (hashpass.link) that backs HashPass Auth (QR login) -- a separate service from the main Hashpass API. No default yet (DNS/infra pending); required only if `client.authQr` is used. */
  linksApiBaseUrl?: string | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  headers?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
  retry?: Partial<RetryPolicy> | undefined;
  /** Persistent session storage supplied by the host (Keychain, local storage, etc.). */
  sessionStore?: AuthSessionStore | undefined;
  /** Advanced token provider. Takes precedence over the built-in session provider. */
  auth?: AuthProvider | undefined;
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface AuthProvider {
  getAccessToken(): string | null | Promise<string | null>;
  onUnauthorized?(): void | Promise<void>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined> | undefined;
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal | undefined;
  authenticated?: boolean | undefined;
  idempotencyKey?: string | undefined;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}
