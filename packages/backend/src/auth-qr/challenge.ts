import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const QR_AUTH_TTL_SECONDS = 180;

export const opaqueToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

export const challengeHash = (value: string): string =>
  createHash('sha256').update(value).digest('base64url');

// Constant-time so a network- or timing-observer can't distinguish "close"
// from "wrong" PKCE verifiers.
export function verifyCodeVerifier(verifier: string, expected: string): boolean {
  const actual = Buffer.from(challengeHash(verifier));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
