import { HashpassError } from "../errors.js";
import { HttpTransport } from "../transport.js";
import type { AuthProvider } from "../types.js";
import { createPkcePair } from "./pkce.js";
import type { BeginQrLoginResult, QrLoginPoll, QrLoginSession, WaitForQrLoginOptions } from "./types.js";

export interface AuthQrClientOptions {
  appId: string;
  fetch: typeof globalThis.fetch;
  /** Base URL of the HashPass Links API (hashpass.link) -- a separate service from the main Hashpass API, so it isn't covered by HashpassSdkOptions.baseUrl/environment. Not yet configured with stable per-environment defaults (DNS/infra pending), so callers must pass it explicitly. */
  baseUrl?: string | undefined;
  timeoutMs: number;
  headers?: Record<string, string> | undefined;
  auth?: AuthProvider | undefined;
}

const BINDING_HEADER = "x-hashpass-binding";

interface CreateChallengeResponse {
  id: string;
  qrUrl: string;
  expiresAt: string;
  state: string;
  binding: string;
}

interface ExchangeResponse {
  status: "consumed";
  userId: string;
  session: { accessToken: string; refreshToken: string };
}

// "HashPass Auth": passwordless login via QR code -- a browser (e.g.
// hashpass.club) starts a challenge, the HashPass mobile app scans and
// approves it under the user's own session, and the browser exchanges the
// resulting one-time code for a real session. Talks to its own service
// (packages/hashpass-links-api) rather than the main api.hashpass.tech, so
// it gets its own lazily-created transport rather than sharing the SDK's
// default one.
export class AuthQrClient {
  #options: AuthQrClientOptions;
  #transport: HttpTransport | undefined;

  constructor(options: AuthQrClientOptions) {
    this.#options = options;
  }

  #transportOrThrow(): HttpTransport {
    if (!this.#options.baseUrl) {
      throw new HashpassError(
        "HashPass Auth (QR login) requires linksApiBaseUrl to be configured on the Hashpass SDK client",
        { code: "configuration_error" },
      );
    }
    if (!this.#transport) {
      this.#transport = new HttpTransport({
        baseUrl: this.#options.baseUrl,
        appId: this.#options.appId,
        fetch: this.#options.fetch,
        headers: this.#options.headers,
        timeoutMs: this.#options.timeoutMs,
        auth: this.#options.auth,
      });
    }
    return this.#transport;
  }

  /** Starts a login attempt: creates a server-side challenge and returns the QR payload plus the PKCE verifier and binding secret to hold onto until exchange. */
  async beginLogin(): Promise<BeginQrLoginResult> {
    const { codeVerifier, codeChallenge } = await createPkcePair();
    const response = await this.#transportOrThrow().request<CreateChallengeResponse>("api/v1/auth/qr/challenges", {
      method: "POST",
      authenticated: false,
      body: { codeChallenge },
    });
    const { binding, ...challenge } = response;
    return { challenge, codeVerifier, binding };
  }

  /** Polls the challenge's current status once. Most callers want waitForLogin() instead, which drives the full poll loop. */
  async pollLogin(
    challengeId: string,
    state: string,
    binding: string,
    options: { signal?: AbortSignal | undefined } = {},
  ): Promise<QrLoginPoll> {
    return this.#transportOrThrow().request<QrLoginPoll>(
      `api/v1/auth/qr/challenges/${encodeURIComponent(challengeId)}`,
      { authenticated: false, query: { state }, headers: { [BINDING_HEADER]: binding }, signal: options.signal },
    );
  }

  /** Trades an approved, one-time authorization code (plus its PKCE verifier and binding secret) for a real session. Exposed directly for callers driving their own poll loop instead of waitForLogin(). */
  async exchangeLogin(input: {
    challengeId: string;
    state: string;
    codeVerifier: string;
    binding: string;
    authorizationCode: string;
  }): Promise<QrLoginSession> {
    const response = await this.#transportOrThrow().request<ExchangeResponse>("api/v1/auth/qr/exchange", {
      method: "POST",
      authenticated: false,
      headers: { [BINDING_HEADER]: input.binding },
      body: {
        challengeId: input.challengeId,
        state: input.state,
        codeVerifier: input.codeVerifier,
        authorizationCode: input.authorizationCode,
      },
    });
    return {
      userId: response.userId,
      accessToken: response.session.accessToken,
      refreshToken: response.session.refreshToken,
    };
  }

  /** Polls until the challenge is approved, denied, or expired (or the caller aborts), then exchanges an approval for a real session. */
  async waitForLogin(result: BeginQrLoginResult, options: WaitForQrLoginOptions = {}): Promise<QrLoginSession> {
    const interval = options.pollIntervalMs ?? 2_000;
    const { challenge, codeVerifier, binding } = result;
    // HttpTransport already retries a single GET internally (see isRetryable
    // in transport.ts), but a *sustained* run of gateway-level 5xx blips
    // (confirmed live: clean, fast 503s with no matching Lambda-side error,
    // i.e. from API Gateway itself, not the application) can outlast those
    // retries. Without this, the very next poll cycle to hit that window
    // throws immediately, surfacing a hard "Service Unavailable" for what's
    // often a transient few-second condition. Tolerate a bounded run of
    // consecutive failed poll cycles before finally giving up.
    const maxConsecutivePollFailures = 3;
    let consecutivePollFailures = 0;

    while (!options.signal?.aborted) {
      let poll: QrLoginPoll;
      try {
        poll = await this.pollLogin(challenge.id, challenge.state, binding, { signal: options.signal });
        consecutivePollFailures = 0;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        consecutivePollFailures += 1;
        if (consecutivePollFailures >= maxConsecutivePollFailures) throw error;
        await wait(interval, options.signal);
        continue;
      }
      options.onPoll?.(poll);

      if (poll.status === "approved" && poll.authorizationCode) {
        return this.exchangeLogin({
          challengeId: challenge.id,
          state: challenge.state,
          codeVerifier,
          binding,
          authorizationCode: poll.authorizationCode,
        });
      }
      if (poll.status === "denied") {
        throw new HashpassError("Login was denied on the HashPass app", { code: "unauthorized" });
      }
      if (poll.status === "expired") {
        throw new HashpassError("QR login expired before it was approved", { code: "timeout" });
      }
      await wait(interval, options.signal);
    }
    throw new HashpassError("QR login was cancelled", { code: "timeout" });
  }

  /**
   * Called by the HashPass mobile app, under its own authenticated session,
   * to approve or deny a scanned login. Unlike the browser-side methods
   * above, this is bearer-token authenticated (via this client's configured
   * `auth`), not the browser-binding header.
   */
  async respondToLogin(challengeId: string, decision: "approve" | "deny"): Promise<{ status: "approved" | "denied" }> {
    return this.#transportOrThrow().request(`api/v1/auth/qr/challenges/${encodeURIComponent(challengeId)}/approve`, {
      method: "POST",
      body: { decision },
      // POST requests aren't retried by HttpTransport by default (only
      // GET/DELETE, or a POST carrying an idempotency key) -- without this,
      // a single transient API-Gateway-level 5xx blip (confirmed live:
      // clean, fast 503s with no matching Lambda error, i.e. gateway-level,
      // not application-level) surfaces immediately as a hard "Service
      // Unavailable" error with zero retry. The server-side update is
      // already conditioned on the challenge still being 'pending', so a
      // retry after a real prior success just hits the existing "already
      // handled" 409 (not retried -- see isRetryable) instead of double-applying.
      idempotencyKey: `${challengeId}:${decision}`,
    });
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timeout); reject(signal.reason); }, { once: true });
  });
}
