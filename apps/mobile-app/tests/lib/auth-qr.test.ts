import { parseAuthQrScan } from '../../lib/auth-qr';

describe('parseAuthQrScan', () => {
  const originalEnv = process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_LINKS_API_BASE_URL = originalEnv;
  });

  it('extracts the challenge id from a HashPass Auth QR URL', () => {
    delete process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;
    expect(parseAuthQrScan('https://hashpass.link/auth/chal_abc123')).toEqual({ challengeId: 'chal_abc123' });
  });

  it('tolerates a trailing slash', () => {
    delete process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;
    expect(parseAuthQrScan('https://hashpass.link/auth/chal_abc123/')).toEqual({ challengeId: 'chal_abc123' });
  });

  it('returns null for a scan that is not a URL', () => {
    expect(parseAuthQrScan('not-a-url')).toBeNull();
  });

  it('returns null for a URL that does not match the /auth/:id shape', () => {
    delete process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;
    expect(parseAuthQrScan('https://hashpass.link/other/chal_abc123')).toBeNull();
  });

  it('returns null for an unrelated QR code (e.g. a pass token deep link)', () => {
    delete process.env.EXPO_PUBLIC_LINKS_API_BASE_URL;
    expect(parseAuthQrScan('hashpass://qr/some-pass-token')).toBeNull();
  });

  it('requires an origin match when EXPO_PUBLIC_LINKS_API_BASE_URL is configured', () => {
    process.env.EXPO_PUBLIC_LINKS_API_BASE_URL = 'https://links-dev.example.com/';
    expect(parseAuthQrScan('https://hashpass.link/auth/chal_abc123')).toBeNull();
    expect(parseAuthQrScan('https://links-dev.example.com/auth/chal_abc123')).toEqual({ challengeId: 'chal_abc123' });
  });
});
