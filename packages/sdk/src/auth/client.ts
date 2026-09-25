import { HashpassError } from "../errors.js";
import type { HttpTransport } from "../transport.js";
import type { SupportSession } from "../support/types.js";
import type {
  AuthSession,
  AuthSessionStore,
  BeginDeviceLoginInput,
  DeviceAuthorization,
  SessionAuthProvider,
  WaitForDeviceLoginOptions,
} from "./types.js";

export class MemorySessionStore implements AuthSessionStore {
  #session: AuthSession | null = null;
  get(): AuthSession | null { return this.#session; }
  set(session: AuthSession): void { this.#session = session; }
  clear(): void { this.#session = null; }
}

export class HashpassAuth implements SessionAuthProvider {
  constructor(private readonly transport: HttpTransport, private readonly store: AuthSessionStore) {}

  async getSession(): Promise<AuthSession | null> { return this.store.get(); }

  async getAccessToken(): Promise<string | null> {
    const session = await this.store.get();
    if (!session) return null;
    if (Date.parse(session.expiresAt) > Date.now() + 30_000) return session.accessToken;
    if (!session.refreshToken) return null;
    const refreshed = await this.transport.request<AuthSession>("v1/auth/token", {
      method: "POST",
      authenticated: false,
      body: { grantType: "refresh_token", refreshToken: session.refreshToken },
    });
    await this.store.set(refreshed);
    return refreshed.accessToken;
  }

  async beginDeviceLogin(input: BeginDeviceLoginInput = {}): Promise<DeviceAuthorization> {
    return this.transport.request("v1/auth/device/authorize", {
      method: "POST",
      authenticated: false,
      body: { scopes: input.scopes ?? ["openid", "profile", "support"], audience: input.audience },
    });
  }

  async waitForDeviceLogin(
    authorization: DeviceAuthorization,
    options: WaitForDeviceLoginOptions = {},
  ): Promise<AuthSession> {
    const deadline = Date.now() + authorization.expiresIn * 1_000;
    let interval = Math.max(authorization.interval, 1) * 1_000;
    while (Date.now() < deadline && !options.signal?.aborted) {
      await wait(interval, options.signal);
      options.onPending?.(authorization);
      try {
        const session = await this.transport.request<AuthSession>("v1/auth/device/token", {
          method: "POST",
          authenticated: false,
          body: { deviceCode: authorization.deviceCode },
          signal: options.signal,
        });
        await this.store.set(session);
        return session;
      } catch (error) {
        if (!(error instanceof HashpassError) || error.code !== "validation_error") throw error;
        const reason = readReason(error.details);
        if (reason === "slow_down") { interval += 5_000; continue; }
        if (reason !== "authorization_pending") throw error;
      }
    }
    throw new HashpassError("Device authorization expired or was cancelled", { code: "unauthorized" });
  }

  async logout(): Promise<void> {
    const session = await this.store.get();
    try {
      if (session?.refreshToken) {
        await this.transport.request("v1/auth/revoke", {
          method: "POST",
          body: { refreshToken: session.refreshToken },
          idempotencyKey: `revoke:${session.refreshToken.slice(-8)}`,
        });
      }
    } finally {
      await this.store.clear();
    }
  }

  async onUnauthorized(): Promise<void> { await this.store.clear(); }

  /**
   * Support sessions (anonymous widget visitors) are a distinct, non-refreshable
   * credential from the OAuth device-flow session above, but the transport only
   * knows how to attach one bearer token. Adopting it into the same store is what
   * makes `SupportClient` calls after `createSupportSession`/`identifySupportVisitor`
   * actually carry the visitor's token instead of going out unauthenticated.
   */
  async adoptSupportSession(session: SupportSession): Promise<void> {
    await this.store.set({
      accessToken: session.token,
      tokenType: "Bearer",
      expiresAt: session.expiresAt,
      scope: ["support"],
      user: { id: session.visitorId },
    });
  }
}

function readReason(details: unknown): string | undefined {
  return details && typeof details === "object" && "reason" in details
    ? String((details as { reason: unknown }).reason)
    : undefined;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timeout); reject(signal.reason); }, { once: true });
  });
}
