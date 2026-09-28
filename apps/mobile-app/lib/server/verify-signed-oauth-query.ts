import { createHmac, timingSafeEqual } from 'node:crypto';

const canonicalize = (params: URLSearchParams) => {
  const canonical = new URLSearchParams();
  const entries = [...params.entries()].sort(([keyA, valueA], [keyB, valueB]) => {
    if (keyA !== keyB) return keyA < keyB ? -1 : 1;
    if (valueA !== valueB) return valueA < valueB ? -1 : 1;
    return 0;
  });
  for (const [key, value] of entries) canonical.append(key, value);
  return canonical.toString();
};

export async function verifySignedOAuthQuery(query: string, secret: string): Promise<boolean> {
  const params = new URLSearchParams(query);
  const signatures = params.getAll('sig');
  const signature = signatures[0] || '';
  const expiresAt = Number(params.get('exp'));
  params.delete('sig');

  if (signatures.length !== 1 || !signature || !Number.isFinite(expiresAt)) return false;
  if (expiresAt * 1000 < Date.now()) return false;

  // Better Auth signs consent redirects with HMAC-SHA256 and standard base64.
  const expected = createHmac('sha256', secret).update(canonicalize(params)).digest('base64');
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}
