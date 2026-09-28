import { normalizeSafeReturnToPath } from '../../../lib/auth/return-to';

describe('safe auth return paths', () => {
  it('preserves percent-encoded nested OAuth query values', () => {
    const path = '/mcp/login?redirect_uri=https%3A%2F%2Fchatgpt.com%2Fcallback%3Fsource%3Done%26mode%3Dmcp&sig=signed';
    expect(normalizeSafeReturnToPath(path)).toBe(path);
  });

  it.each([
    'https://evil.example',
    '//evil.example/path',
    '/\\evil.example/path',
    ' \t//evil.example/path',
    '/auth',
    '/auth/callback?code=one',
  ])('rejects unsafe or recursive destinations: %s', (path) => {
    expect(normalizeSafeReturnToPath(path)).toBe('/dashboard/explore');
  });

  it('removes Expo Router groups from browser paths', () => {
    expect(normalizeSafeReturnToPath('/(shared)/dashboard/explore')).toBe('/dashboard/explore');
  });
});
