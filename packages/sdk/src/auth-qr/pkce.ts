import { HashpassError } from "../errors.js";

// Portable base64url (RFC 4648 §5) encoder -- deliberately avoids both
// Node's Buffer and the DOM's btoa/atob, neither of which is guaranteed
// across this SDK's actual runtimes (browsers, React Native/Hermes, Node,
// the CLI). Matches the unpadded alphabet the API side produces via
// Node's `Buffer#toString('base64url')`.
const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64UrlEncode(bytes: Uint8Array): string {
  let result = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += BASE64URL_ALPHABET[b0 >> 2];
    result += BASE64URL_ALPHABET[((b0 & 0x03) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    if (b1 !== undefined) result += BASE64URL_ALPHABET[((b1 & 0x0f) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    if (b2 !== undefined) result += BASE64URL_ALPHABET[b2 & 0x3f];
  }
  return result;
}

function getWebCrypto(): Crypto {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new HashpassError("Web Crypto (crypto.subtle) is required for HashPass Auth QR login", {
      code: "configuration_error",
    });
  }
  return webCrypto;
}

export interface PkcePair {
  /** Kept client-side only; sent to the API just once, at exchange time. */
  codeVerifier: string;
  /** Sent to the API at challenge-creation time; the server never sees the verifier until exchange. */
  codeChallenge: string;
}

// S256 PKCE (RFC 7636): codeChallenge = base64url(sha256(codeVerifier)).
// Matches the API's `challengeHash()`/`verifyCodeVerifier()` in
// packages/backend/src/auth-qr/challenge.ts exactly -- same hash, same
// encoding, computed over the verifier's raw UTF-8 bytes.
export async function createPkcePair(): Promise<PkcePair> {
  const webCrypto = getWebCrypto();
  const verifierBytes = new Uint8Array(32);
  webCrypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncode(verifierBytes);

  const digest = await webCrypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));

  return { codeVerifier, codeChallenge };
}
