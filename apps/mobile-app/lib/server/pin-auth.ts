import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { StepUpClaims, StepUpScope } from '../types/step-up.types';

export type { StepUpClaims, StepUpScope };

// Server half of the second factor. The database stores only the verifier this
// module derives; the pepper lives in the API environment and never reaches it.
//
// A 4-digit PIN has 10,000 values, so no hash can protect it once an attacker
// holds both the verifier and the pepper. The design therefore relies on two
// independent barriers: the pepper (a database leak alone is useless) and the
// lockout in verify_user_pin() (online guessing is capped). Do not weaken either
// on the assumption that the other one is enough.

export const PIN_PATTERN = /^\d{4}$/;
const PEPPER_MIN_LENGTH = 32;
const KDF_LABEL = 'hashpass-pin:v1';
const PROOF_LABEL = 'hashpass-step-up:v1';

/** Highest-risk scopes first. A proof only ever authorises the scope it names. */
export const STEP_UP_SCOPES = ['app:unlock', 'wallet:sign'] as const satisfies readonly StepUpScope[];
export const STEP_UP_TTL_SECONDS: Record<StepUpScope, number> = { 'app:unlock': 300, 'wallet:sign': 60 };
export const isStepUpScope = (value: unknown): value is StepUpScope =>
  typeof value === 'string' && (STEP_UP_SCOPES as readonly string[]).includes(value);

export class PinConfigurationError extends Error {
  constructor() { super('pin_unavailable'); this.name = 'PinConfigurationError'; }
}

function pepper(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.HASHPASS_PIN_PEPPER;
  if (!value || value.length < PEPPER_MIN_LENGTH) throw new PinConfigurationError();
  return value;
}

/** 64 lowercase hex characters, bound to the user so identical PINs never share a verifier. */
export function derivePinVerifier(userId: string, pin: string, env?: NodeJS.ProcessEnv): string {
  if (!PIN_PATTERN.test(pin)) throw new Error('invalid_pin');
  return createHmac('sha256', pepper(env)).update(`${KDF_LABEL}:${userId}:${pin}`).digest('hex');
}

const encode = (value: Buffer | string) => Buffer.from(value).toString('base64url');

/**
 * A short-lived proof that this user just entered their PIN. Sensitive endpoints
 * (wallet signing) require one for their scope; it is not a session and cannot be
 * used to authenticate. Signed with a key derived from the pepper under a separate
 * label, so a PIN verifier can never be replayed as a proof or the reverse.
 */
export function issueStepUpProof(userId: string, scope: StepUpScope, now = Date.now(), env?: NodeJS.ProcessEnv): { token: string; expiresAt: string } {
  const iat = Math.floor(now / 1000);
  const claims: StepUpClaims = { v: 1, sub: userId, scope, iat, exp: iat + STEP_UP_TTL_SECONDS[scope], jti: randomUUID() };
  const body = encode(JSON.stringify(claims));
  return { token: `${body}.${sign(body, env)}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function verifyStepUpProof(token: unknown, expected: { userId: string; scope: StepUpScope }, now = Date.now(), env?: NodeJS.ProcessEnv): boolean {
  if (typeof token !== 'string' || token.length > 512) return false;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined) return false;
  const wanted = Buffer.from(sign(body, env));
  const given = Buffer.from(signature);
  if (wanted.length !== given.length || !timingSafeEqual(wanted, given)) return false;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<StepUpClaims>;
    return claims.v === 1 && claims.sub === expected.userId && claims.scope === expected.scope &&
      typeof claims.exp === 'number' && claims.exp > Math.floor(now / 1000);
  } catch { return false; }
}

function sign(body: string, env?: NodeJS.ProcessEnv): string {
  const key = createHmac('sha256', pepper(env)).update(PROOF_LABEL).digest();
  return createHmac('sha256', key).update(body).digest('base64url');
}
