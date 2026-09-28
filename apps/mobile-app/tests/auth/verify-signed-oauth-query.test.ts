import { createHmac } from 'node:crypto';
import { verifySignedOAuthQuery } from '../../lib/server/verify-signed-oauth-query';

const secret = 'test-secret-that-is-long-enough-for-signing';

const signedQuery = async (expiresAt: number) => {
  const params = new URLSearchParams([
    ['scope', 'openid plane:read'],
    ['client_id', 'chatgpt-client'],
    ['exp', String(expiresAt)],
  ]);
  const canonical = new URLSearchParams([...params.entries()].sort(([a, av], [b, bv]) => (
    a === b ? av.localeCompare(bv) : a.localeCompare(b)
  ))).toString();
  params.set('sig', createHmac('sha256', secret).update(canonical).digest('base64'));
  return params.toString();
};

it('accepts an unmodified, unexpired Better Auth OAuth query', async () => {
  const query = await signedQuery(Math.floor(Date.now() / 1000) + 60);
  await expect(verifySignedOAuthQuery(query, secret)).resolves.toBe(true);
});

it('rejects tampered, duplicate-signature, and expired OAuth queries', async () => {
  const valid = await signedQuery(Math.floor(Date.now() / 1000) + 60);
  const expired = await signedQuery(Math.floor(Date.now() / 1000) - 1);

  await expect(verifySignedOAuthQuery(`${valid}&scope=plane:write`, secret)).resolves.toBe(false);
  await expect(verifySignedOAuthQuery(`${valid}&sig=duplicate`, secret)).resolves.toBe(false);
  await expect(verifySignedOAuthQuery(expired, secret)).resolves.toBe(false);
});
