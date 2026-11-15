import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthenticatorScope } from '../../types/authenticator.types';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const AUTHENTICATOR_HEADER = 'X-Hashpass-Authenticator';
export function authenticatorKey(env = process.env): Buffer {
  const raw = env.HASHPASS_TOTP_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw new Error('authenticator_unavailable');
  return Buffer.from(raw, 'hex');
}
export function newAuthenticatorSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return output;
}
function decode(secret: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('invalid_secret');
  const result: number[] = []; let bits = 0, value = 0;
  for (const char of secret) {
    value = (value << 5) | alphabet.indexOf(char); bits += 5;
    if (bits >= 8) { result.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(result);
}
/** RFC 6238 defaults supported by Google Authenticator and Authy. */
export function authenticatorCode(secret: string, counter: number): string {
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decode(secret)).update(bytes).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
export function matchAuthenticatorCode(secret: string, code: unknown, now = Date.now()): number | null {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const counter of [current, current - 1, current + 1]) {
    if (counter >= 0 && timingSafeEqual(Buffer.from(code), Buffer.from(authenticatorCode(secret, counter)))) return counter;
  }
  return null;
}
export function sealAuthenticatorSecret(secret: string, userId: string, env = process.env): string {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', authenticatorKey(env), iv);
  cipher.setAAD(Buffer.from(`hashpass-totp:v1:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}
export function openAuthenticatorSecret(sealed: string, userId: string, env = process.env): string {
  const bytes = Buffer.from(sealed, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', authenticatorKey(env), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(`hashpass-totp:v1:${userId}`)); decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
}
const sign = (body: string, env = process.env) => createHmac('sha256', authenticatorKey(env)).update(`hashpass-totp-proof:v1:${body}`).digest('base64url');
export function issueAuthenticatorProof(userId: string, scope: AuthenticatorScope, now = Date.now(), env = process.env) {
  const exp = Math.floor(now / 1000) + (scope === 'access' ? 300 : 60);
  const body = Buffer.from(JSON.stringify({ sub: userId, scope, exp, iat: Math.floor(now / 1000), nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return { token: `${body}.${sign(body, env)}`, expiresAt: new Date(exp * 1000).toISOString() };
}
export function verifyAuthenticatorProof(token: unknown, userId: string, scope: AuthenticatorScope, now = Date.now(), env = process.env): boolean {
  if (typeof token !== 'string' || token.length > 1024) return false;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return false;
  const wanted = Buffer.from(sign(body, env)), given = Buffer.from(signature);
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const seconds = Math.floor(now / 1000);
    return claims.sub === userId && claims.scope === scope && Number.isInteger(claims.iat) && claims.iat <= seconds &&
      Number.isInteger(claims.exp) && claims.exp > seconds && claims.exp - claims.iat === (scope === 'access' ? 300 : 60);
  } catch { return false; }
}
export const recoveryCodeHash = (userId: string, code: string) =>
  createHmac('sha256', authenticatorKey()).update(`hashpass-totp-recovery:v1:${userId}:${code}`).digest('hex');
