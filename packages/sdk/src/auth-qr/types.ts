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

/** The PKCE verifier and binding secret travel alongside the challenge but are never themselves part of the QR payload -- keep them in memory, not in anything rendered or logged. `binding` proves poll/exchange calls come from the same browser that created the challenge; sent back as the `x-hashpass-binding` header (not a cookie -- see the API's README for why). */
export interface BeginQrLoginResult {
  challenge: QrLoginChallenge;
  codeVerifier: string;
  binding: string;
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
