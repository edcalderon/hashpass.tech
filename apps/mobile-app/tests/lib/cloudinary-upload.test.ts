jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { cloudinary: { cloudName: 'test-cloud' } } } },
}));

import { uploadImage } from '../../lib/cloudinary';

describe('uploadImage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts a multipart payload directly to Cloudinary', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ secure_url: 'https://cdn.example/avatar.png' }),
    }) as typeof fetch;

    const result = await uploadImage(new Blob(['avatar']) as unknown as File, {
      folder: 'avatars',
      publicId: 'user-1',
      tags: ['avatar'],
      uploadPreset: 'custom-preset',
    });

    expect(result).toEqual({ secure_url: 'https://cdn.example/avatar.png' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.cloudinary.com/v1_1/test-cloud/image/upload',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
  });

  it('surfaces Cloudinary error responses', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid upload preset' } }),
    }) as typeof fetch;

    await expect(uploadImage(new Blob(['avatar']) as unknown as File)).rejects.toThrow(
      'Invalid upload preset',
    );
  });

  it('accepts a native URI-backed upload part', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ secure_url: 'https://cdn.example/native-avatar.png' }),
    }) as typeof fetch;

    const nativePart = {
      uri: 'file:///avatar.png',
      name: 'avatar.png',
      type: 'image/png',
    };

    try {
      await expect(uploadImage(nativePart)).resolves.toEqual({
        secure_url: 'https://cdn.example/native-avatar.png',
      });
      expect(appendSpy).toHaveBeenCalledWith('file', nativePart);
    } finally {
      appendSpy.mockRestore();
    }
  });
});
