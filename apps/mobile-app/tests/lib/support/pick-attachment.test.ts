/// <reference types="jest" />

const mockPick = jest.fn();
jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));

// pick-attachment.ts only needs these two constants from frappe-support-client
// -- mocking the whole module avoids pulling in its real (heavy, expo-constants
// / @hashpass/auth-dependent) import chain just to read two literals.
const SUPPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
jest.mock('../../../lib/support/frappe-support-client', () => ({
  SUPPORT_ATTACHMENT_ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
  SUPPORT_ATTACHMENT_MAX_BYTES,
}));

import { pickAttachmentNative, isPickedAttachmentError } from '../../../lib/support/pick-attachment';

describe('lib/support/pick-attachment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockPick.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('pickAttachmentNative', () => {
    it('returns null when the user cancels the picker', async () => {
      mockPick.mockResolvedValue({ canceled: true });
      expect(await pickAttachmentNative()).toBeNull();
    });

    it('returns null when the picker reports success but no asset', async () => {
      mockPick.mockResolvedValue({ canceled: false, assets: [] });
      expect(await pickAttachmentNative()).toBeNull();
    });

    it('rejects a disallowed mime type before ever fetching the asset', async () => {
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked', name: 'archive.zip', mimeType: 'application/zip', size: 10 }],
      });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await pickAttachmentNative();

      expect(isPickedAttachmentError(result)).toBe(true);
      expect((result as { message: string }).message).toMatch(/images and PDF/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects a file over the size limit reported by the picker, without fetching it', async () => {
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///picked',
            name: 'big.png',
            mimeType: 'image/png',
            size: SUPPORT_ATTACHMENT_MAX_BYTES + 1,
          },
        ],
      });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const result = await pickAttachmentNative();

      expect(isPickedAttachmentError(result)).toBe(true);
      expect((result as { message: string }).message).toMatch(/too large/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects when the fetched blob turns out to be over the size limit even though the reported size was not', async () => {
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked', name: 'big.png', mimeType: 'image/png', size: 10 }],
      });
      const oversizedBlob = { size: SUPPORT_ATTACHMENT_MAX_BYTES + 1, type: 'image/png' };
      global.fetch = jest.fn().mockResolvedValue({ blob: async () => oversizedBlob }) as unknown as typeof fetch;

      const result = await pickAttachmentNative();

      expect(isPickedAttachmentError(result)).toBe(true);
      expect((result as { message: string }).message).toMatch(/too large/i);
    });

    it('returns a real File built from the fetched blob on success', async () => {
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked', name: 'photo.png', mimeType: 'image/png', size: 3 }],
      });
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
      global.fetch = jest.fn().mockResolvedValue({ blob: async () => blob }) as unknown as typeof fetch;

      const result = await pickAttachmentNative();

      expect(isPickedAttachmentError(result)).toBe(false);
      expect(result).toBeInstanceOf(File);
      expect((result as File).name).toBe('photo.png');
      expect((result as File).type).toBe('image/png');
    });

    it('falls back to a generic name and content type when the asset/blob provide none', async () => {
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///picked', mimeType: 'application/pdf', size: 1 }],
      });
      const blob = new Blob([new Uint8Array([1])]);
      global.fetch = jest.fn().mockResolvedValue({ blob: async () => blob }) as unknown as typeof fetch;

      const result = (await pickAttachmentNative()) as File;

      expect(result.name).toBe('attachment');
      // application/pdf comes from the asset's mimeType, not the blob
      expect(result.type).toBe('application/pdf');
    });
  });

  describe('isPickedAttachmentError', () => {
    it('identifies a { message } object as an error', () => {
      expect(isPickedAttachmentError({ message: 'bad' })).toBe(true);
    });

    it('rejects null, a File, and other non-error values', () => {
      expect(isPickedAttachmentError(null)).toBe(false);
      expect(isPickedAttachmentError(undefined)).toBe(false);
      expect(isPickedAttachmentError('nope')).toBe(false);
      expect(isPickedAttachmentError(new File(['x'], 'a.png'))).toBe(false);
    });
  });
});
