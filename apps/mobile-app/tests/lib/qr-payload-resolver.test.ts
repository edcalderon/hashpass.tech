import { resolveHashpassQrPayload } from '../../lib/qr-payload-resolver';
import { apiClient } from '../../lib/api-client';

jest.mock('../../lib/api-client', () => ({
  apiClient: { post: jest.fn() },
}));

describe('resolveHashpassQrPayload', () => {
  it('posts a parsed payload through the backend resolver', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({
      success: true,
      data: { valid: true, kind: 'hpass_id', message: 'HashPass user identified' },
    });

    const payload = { kind: 'hpass_id', raw: 'hpass-user-1234', hpassId: 'hpass-user-1234', isValid: true } as const;
    await expect(resolveHashpassQrPayload(payload)).resolves.toMatchObject({ valid: true });
    expect(apiClient.post).toHaveBeenCalledWith('/qr/resolve', payload, { skipEventSegment: true });
  });

  it('surfaces backend failures without leaking the raw response', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ success: false, error: 'QR was not found' });

    await expect(resolveHashpassQrPayload({ kind: 'url', raw: 'https://example.com', isValid: true }))
      .rejects.toThrow('QR was not found');
  });
});
