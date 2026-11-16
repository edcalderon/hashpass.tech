import { issueAuthenticatorProof } from '../lib/server/authenticator';
import { issueStepUpProof } from '../lib/server/pin-auth';

/** Existing behavior fixtures now authenticate both factors; denial cases use Request directly. */
export function securityRequest(userId: string, url: string | URL | Request, init: RequestInit = {}): Request {
  process.env.HASHPASS_TOTP_KEY = 'ab'.repeat(32);
  const headers = new Headers(init.headers);
  headers.set('X-Hashpass-Authenticator', issueAuthenticatorProof(userId, (init.method ?? 'GET') === 'GET' ? 'access' : 'critical').token);
  if (!headers.has('X-Hashpass-Step-Up') && /contacts|wallet\/enrollment/.test(String(url))) headers.set('X-Hashpass-Step-Up', issueStepUpProof(userId, 'wallet:unlock').token);
  return new Request(url, { ...init, headers });
}
