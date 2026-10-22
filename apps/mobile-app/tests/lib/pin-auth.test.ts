import { derivePinVerifier, isStepUpScope, issueStepUpProof, STEP_UP_TTL_SECONDS, verifyStepUpProof } from '../../lib/server/pin-auth';

const env = { HASHPASS_PIN_PEPPER: 'p'.repeat(48) } as unknown as NodeJS.ProcessEnv;
const other = { HASHPASS_PIN_PEPPER: 'q'.repeat(48) } as unknown as NodeJS.ProcessEnv;
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';

describe('PIN verifier derivation', () => {
  it('is 64 hex characters and deterministic', () => {
    const verifier = derivePinVerifier(alice, '1234', env);
    expect(verifier).toMatch(/^[0-9a-f]{64}$/);
    expect(derivePinVerifier(alice, '1234', env)).toBe(verifier);
  });
  it('differs by user, by PIN, and by pepper, so a leaked table cannot be compared across users', () => {
    const base = derivePinVerifier(alice, '1234', env);
    expect(derivePinVerifier(bob, '1234', env)).not.toBe(base);
    expect(derivePinVerifier(alice, '1235', env)).not.toBe(base);
    expect(derivePinVerifier(alice, '1234', other)).not.toBe(base);
  });
  it.each(['', '123', '12345', 'abcd', '12 4', '１２３４'])('rejects %j as a PIN', pin => {
    expect(() => derivePinVerifier(alice, pin, env)).toThrow('invalid_pin');
  });
  it.each([undefined, '', 'short'])('fails closed without a strong pepper (%j)', pepper => {
    expect(() => derivePinVerifier(alice, '1234', { HASHPASS_PIN_PEPPER: pepper } as unknown as NodeJS.ProcessEnv)).toThrow('pin_unavailable');
  });
});

describe('step-up proofs', () => {
  const now = Date.UTC(2026, 9, 22, 12, 0, 0);
  it('verifies for the same user and scope only', () => {
    const { token } = issueStepUpProof(alice, 'wallet:sign', now, env);
    expect(verifyStepUpProof(token, { userId: alice, scope: 'wallet:sign' }, now, env)).toBe(true);
    expect(verifyStepUpProof(token, { userId: bob, scope: 'wallet:sign' }, now, env)).toBe(false);
    expect(verifyStepUpProof(token, { userId: alice, scope: 'app:unlock' }, now, env)).toBe(false);
  });
  it('expires per scope, and signing proofs are shorter-lived than unlock proofs', () => {
    expect(STEP_UP_TTL_SECONDS['wallet:sign']).toBeLessThan(STEP_UP_TTL_SECONDS['app:unlock']);
    const sign = issueStepUpProof(alice, 'wallet:sign', now, env);
    expect(sign.expiresAt).toBe(new Date(now + 60_000).toISOString());
    expect(verifyStepUpProof(sign.token, { userId: alice, scope: 'wallet:sign' }, now + 59_000, env)).toBe(true);
    expect(verifyStepUpProof(sign.token, { userId: alice, scope: 'wallet:sign' }, now + 60_000, env)).toBe(false);
  });
  it('rejects tampering, a different pepper, and malformed tokens', () => {
    const { token } = issueStepUpProof(alice, 'wallet:sign', now, env);
    const [body, signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: alice, scope: 'wallet:sign', iat: 0, exp: 9_999_999_999, jti: 'x' })).toString('base64url');
    expect(verifyStepUpProof(`${forged}.${signature}`, { userId: alice, scope: 'wallet:sign' }, now, env)).toBe(false);
    expect(verifyStepUpProof(`${body}.${signature}x`, { userId: alice, scope: 'wallet:sign' }, now, env)).toBe(false);
    expect(verifyStepUpProof(token, { userId: alice, scope: 'wallet:sign' }, now, other)).toBe(false);
    for (const bad of [undefined, null, 42, '', 'abc', 'a.b.c', `${token}.extra`, 'x'.repeat(600)]) {
      expect(verifyStepUpProof(bad, { userId: alice, scope: 'wallet:sign' }, now, env)).toBe(false);
    }
  });
  it('cannot be forged from a PIN verifier, which uses a separate derivation label', () => {
    const verifier = derivePinVerifier(alice, '1234', env);
    const body = Buffer.from(JSON.stringify({ v: 1, sub: alice, scope: 'wallet:sign', iat: 0, exp: 9_999_999_999, jti: 'x' })).toString('base64url');
    expect(verifyStepUpProof(`${body}.${verifier}`, { userId: alice, scope: 'wallet:sign' }, now, env)).toBe(false);
  });
  it('mints distinct identifiers each time', () => {
    expect(issueStepUpProof(alice, 'app:unlock', now, env).token).not.toBe(issueStepUpProof(alice, 'app:unlock', now, env).token);
  });
  it('recognises only known scopes', () => {
    expect(isStepUpScope('wallet:sign')).toBe(true);
    expect(isStepUpScope('admin:everything')).toBe(false);
    expect(isStepUpScope(undefined)).toBe(false);
  });
});
