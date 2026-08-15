export type QrLoginStatus = "pending" | "approved" | "denied" | "expired" | "consumed";

/** What `AuthQrClient.beginLogin()` gets back from the API, safe to render into a QR code as-is. */
export interface QrLoginChallenge {
  id: string;
  qrUrl: string;
  expiresAt: string;
  state: string;
}

export interface QrLoginPoll {
  status: QrLoginStatus;
  expiresAt: string;
  /** Present only once `status` is `"approved"`; consumed by exchangeLogin(). */
  authorizationCode?: string | undefined;
}

/** The PKCE verifier travels alongside the challenge but is never itself part of the QR payload -- keep it in memory, not in anything rendered or logged. */
export interface BeginQrLoginResult {
  challenge: QrLoginChallenge;
  codeVerifier: string;
}

export interface QrLoginSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
}

export interface WaitForQrLoginOptions {
  signal?: AbortSignal | undefined;
  pollIntervalMs?: number | undefined;
  onPoll?: ((poll: QrLoginPoll) => void) | undefined;
}
