import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeHash, opaqueToken, verifyCodeVerifier } from './challenge';

test('opaque challenges have sufficient entropy', () => {
  assert.ok(opaqueToken().length >= 43);
});

test('opaque challenges are unique across calls', () => {
  assert.notEqual(opaqueToken(), opaqueToken());
});

test('verifier comparison accepts a matching verifier', () => {
  const verifier = opaqueToken();
  assert.equal(verifyCodeVerifier(verifier, challengeHash(verifier)), true);
});

test('verifier comparison rejects a different verifier', () => {
  const verifier = opaqueToken();
  assert.equal(verifyCodeVerifier(opaqueToken(), challengeHash(verifier)), false);
});

test('verifier comparison rejects a malformed expected hash without throwing', () => {
  assert.equal(verifyCodeVerifier(opaqueToken(), 'not-a-real-hash'), false);
});
