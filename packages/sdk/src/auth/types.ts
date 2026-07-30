import type { AuthProvider } from "../types.js";

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  tokenType: "Bearer";
  expiresAt: string;
  scope: string[];
  user?: { id: string; email?: string; name?: string };
}

export interface AuthSessionStore {
  get(): AuthSession | null | Promise<AuthSession | null>;
  set(session: AuthSession): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface DeviceAuthorization {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
}

export interface BeginDeviceLoginInput {
  scopes?: string[];
  audience?: string;
}

export interface WaitForDeviceLoginOptions {
  signal?: AbortSignal | undefined;
  onPending?: (authorization: DeviceAuthorization) => void;
}

export interface SessionAuthProvider extends AuthProvider {
  getSession(): Promise<AuthSession | null>;
}
