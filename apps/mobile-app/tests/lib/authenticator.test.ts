import { authenticatorCode, matchAuthenticatorCode, newAuthenticatorSecret, sealAuthenticatorSecret,
  openAuthenticatorSecret, issueAuthenticatorProof, verifyAuthenticatorProof } from '../../lib/server/authenticator';
import { authenticatorProof, rememberAuthenticator, clearAuthenticator, beginAuthenticatorChallenge, hasActiveAuthenticatorChallenge } from '../../lib/authenticator-session';

const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // RFC 6238 SHA-1 test secret
const env = { NODE_ENV: 'test', HASHPASS_TOTP_KEY: 'ab'.repeat(32) } as NodeJS.ProcessEnv;
describe('RFC 6238 authenticator', () => {
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']])('matches the SHA-1 reference at %s', (seconds, code) => {
    expect(authenticatorCode(secret, Math.floor(Number(seconds) / 30))).toBe(code);
  });
  it('accepts one step of clock skew, rejects distant and malformed codes', () => {
    expect(matchAuthenticatorCode(secret, '287082', 59000)).toBe(1);
    expect(matchAuthenticatorCode(secret, '287082', 89000)).toBe(1);
    expect(matchAuthenticatorCode(secret, '287082', 90000)).toBeNull();
    for (const code of ['', '12345', '1234567', '１２３４５６', null]) expect(matchAuthenticatorCode(secret, code, 59000)).toBeNull();
  });
  it('generates independent 160-bit Base32 secrets', () => {
    expect(newAuthenticatorSecret()).toMatch(/^[A-Z2-7]{32}$/);
    expect(newAuthenticatorSecret()).not.toBe(newAuthenticatorSecret());
  });
  it('encrypts at rest, authenticates ciphertext and binds it to its owner', () => {
    const sealed = sealAuthenticatorSecret(secret, 'alice', env);
    expect(sealed).not.toContain(secret);
    expect(openAuthenticatorSecret(sealed, 'alice', env)).toBe(secret);
    expect(sealAuthenticatorSecret(secret, 'alice', env)).not.toBe(sealed);
    expect(() => openAuthenticatorSecret(sealed, 'bob', env)).toThrow();
    expect(() => openAuthenticatorSecret(sealed, 'alice', { NODE_ENV: 'test', HASHPASS_TOTP_KEY: 'cd'.repeat(32) } as NodeJS.ProcessEnv)).toThrow();
    expect(() => sealAuthenticatorSecret(secret, 'alice', {} as NodeJS.ProcessEnv)).toThrow('authenticator_unavailable');
  });
  it('binds proofs to actor, scope, server key and expiry', () => {
    const now = 1_700_000_000_000;
    const proof = issueAuthenticatorProof('alice', 'access', now, env);
    expect(verifyAuthenticatorProof(proof.token, 'alice', 'access', now, env)).toBe(true);
    expect(verifyAuthenticatorProof(proof.token, 'bob', 'access', now, env)).toBe(false);
    expect(verifyAuthenticatorProof(proof.token, 'alice', 'critical', now, env)).toBe(false);
    expect(verifyAuthenticatorProof(proof.token, 'alice', 'access', now + 300000, env)).toBe(false);
    expect(verifyAuthenticatorProof(proof.token + 'x', 'alice', 'access', now, env)).toBe(false);
    expect(verifyAuthenticatorProof(proof.token, 'alice', 'access', now - 1000, env)).toBe(false);
    for (const token of [null, 'a.b.c', '', 123]) expect(verifyAuthenticatorProof(token, 'alice', 'access', now, env)).toBe(false);
    expect(Date.parse(issueAuthenticatorProof('alice', 'critical', now, env).expiresAt)).toBe(now + 60000);
  });
});
describe('authenticator proof lifecycle', () => {
  afterEach(() => clearAuthenticator());
  it('never shares proofs across users, scopes, expiry or logout', () => {
    const proof = { token: 'access', expiresAt: new Date(Date.now() + 60000).toISOString() };
    rememberAuthenticator('alice', 'access', proof);
    expect(authenticatorProof('alice', 'access')).toBe('access');
    expect(authenticatorProof('bob', 'access')).toBeNull();
    expect(authenticatorProof('alice', 'critical')).toBeNull();
    rememberAuthenticator('bob', 'critical', proof);
    expect(authenticatorProof('alice', 'access')).toBeNull();
    clearAuthenticator(); expect(authenticatorProof('bob', 'critical')).toBeNull();
    rememberAuthenticator('bob', 'access', { ...proof, expiresAt: new Date(Date.now()).toISOString() });
    expect(authenticatorProof('bob', 'access')).toBeNull();
  });
});
describe('authenticator challenge lifecycle', () => {
  it('keeps overlapping app handoffs active until each challenge ends once', () => {
    expect(hasActiveAuthenticatorChallenge()).toBe(false);
    const endFirst = beginAuthenticatorChallenge();
    const endSecond = beginAuthenticatorChallenge();

    try {
      expect(hasActiveAuthenticatorChallenge()).toBe(true);
      endFirst();
      expect(hasActiveAuthenticatorChallenge()).toBe(true);
      endFirst();
      expect(hasActiveAuthenticatorChallenge()).toBe(true);
      endSecond();
      expect(hasActiveAuthenticatorChallenge()).toBe(false);
    } finally {
      endFirst();
      endSecond();
    }
  });
});
