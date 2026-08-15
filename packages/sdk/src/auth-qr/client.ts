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

interface CreateChallengeResponse {
  id: string;
  qrUrl: string;
  expiresAt: string;
  state: string;
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
      const baseFetch = this.#options.fetch;
      // The API's browser-binding cookie is what proves poll/exchange come
      // from the same browser that created the challenge. hashpass.club and
      // hashpass.link are different registrable domains, so every request
      // through this transport is cross-site by definition and needs
      // credentials:'include' to carry that cookie -- see the SameSite=None
      // comment in packages/hashpass-links-api/src/routes/auth-qr.ts for the
      // matching server-side half of this.
      const withCredentials: typeof globalThis.fetch = (input, init) =>
        baseFetch(input, { ...init, credentials: "include" });

      this.#transport = new HttpTransport({
        baseUrl: this.#options.baseUrl,
        appId: this.#options.appId,
        fetch: withCredentials,
        headers: this.#options.headers,
        timeoutMs: this.#options.timeoutMs,
        auth: this.#options.auth,
      });
    }
    return this.#transport;
  }

  /** Starts a login attempt: creates a server-side challenge and returns the QR payload plus the PKCE verifier to hold onto until exchange. */
  async beginLogin(): Promise<BeginQrLoginResult> {
    const { codeVerifier, codeChallenge } = await createPkcePair();
    const challenge = await this.#transportOrThrow().request<CreateChallengeResponse>("api/v1/auth/qr/challenges", {
      method: "POST",
      authenticated: false,
      body: { codeChallenge },
    });
    return { challenge, codeVerifier };
  }

  /** Polls the challenge's current status once. Most callers want waitForLogin() instead, which drives the full poll loop. */
  async pollLogin(challengeId: string, state: string, options: { signal?: AbortSignal | undefined } = {}): Promise<QrLoginPoll> {
    return this.#transportOrThrow().request<QrLoginPoll>(
      `api/v1/auth/qr/challenges/${encodeURIComponent(challengeId)}`,
      { authenticated: false, query: { state }, signal: options.signal },
    );
  }

  /** Trades an approved, one-time authorization code (plus its PKCE verifier) for a real session. Exposed directly for callers driving their own poll loop instead of waitForLogin(). */
  async exchangeLogin(input: {
    challengeId: string;
    state: string;
    codeVerifier: string;
    authorizationCode: string;
  }): Promise<QrLoginSession> {
    const response = await this.#transportOrThrow().request<ExchangeResponse>("api/v1/auth/qr/exchange", {
      method: "POST",
      authenticated: false,
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
    const { challenge, codeVerifier } = result;

    while (!options.signal?.aborted) {
      const poll = await this.pollLogin(challenge.id, challenge.state, { signal: options.signal });
      options.onPoll?.(poll);

      if (poll.status === "approved" && poll.authorizationCode) {
        return this.exchangeLogin({
          challengeId: challenge.id,
          state: challenge.state,
          codeVerifier,
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
   * `auth`), not bound by the browser cookie.
   */
  async respondToLogin(challengeId: string, decision: "approve" | "deny"): Promise<{ status: "approved" | "denied" }> {
    return this.#transportOrThrow().request(`api/v1/auth/qr/challenges/${encodeURIComponent(challengeId)}/approve`, {
      method: "POST",
      body: { decision },
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
