/// <reference types="jest" />

const mockPick = jest.fn();

jest.mock('expo-document-picker', () => ({ getDocumentAsync: (...args: unknown[]) => mockPick(...args) }));

// The picker only consumes these shared constants. Mocking the client keeps
// this unit test independent of its native API-client/Expo runtime setup.
jest.mock('../../../lib/support/frappe-support-client', () => ({
  SUPPORT_ATTACHMENT_MAX_BYTES: 10 * 1024 * 1024,
  SUPPORT_ATTACHMENT_ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
}));

describe('pickAttachmentNative', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    mockPick.mockReset();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns null without fetching when the picker is cancelled or has no asset', async () => {
    mockPick.mockResolvedValue({ canceled: true });
    const { pickAttachmentNative } = require('../../../lib/support/pick-attachment');
    await expect(pickAttachmentNative()).resolves.toBeNull();
    expect(mockPick).toHaveBeenCalledWith(expect.objectContaining({ copyToCacheDirectory: true, multiple: false }));

    mockPick.mockResolvedValue({ canceled: false, assets: [] });
    await expect(pickAttachmentNative()).resolves.toBeNull();
  });

  it('rejects unsupported and declared oversized files before fetching their URI', async () => {
    const { pickAttachmentNative } = require('../../../lib/support/pick-attachment');
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///bad.html', name: 'bad.html', mimeType: 'text/html', size: 4 }] });
    await expect(pickAttachmentNative()).resolves.toEqual({ message: 'Only images and PDF files can be attached.' });

    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///large.png', name: 'large.png', mimeType: 'image/png', size: 10 * 1024 * 1024 + 1 }] });
    await expect(pickAttachmentNative()).resolves.toEqual({ message: 'File is too large (10MB max).' });
  });

  it('rejects a downloaded file that exceeds the attachment limit', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///large.png', name: 'large.png', mimeType: 'image/png' }] });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' })) }) as unknown as typeof fetch;
    const { pickAttachmentNative } = require('../../../lib/support/pick-attachment');
    await expect(pickAttachmentNative()).resolves.toEqual({ message: 'File is too large (10MB max).' });
  });

  it('turns an allowed picker asset into a File with its name and MIME type', async () => {
    mockPick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///receipt.png', name: 'receipt.png', mimeType: 'image/png', size: 3 }] });
    global.fetch = jest.fn().mockResolvedValue({ blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }) as unknown as typeof fetch;
    const { isPickedAttachmentError, pickAttachmentNative } = require('../../../lib/support/pick-attachment');
    const result = await pickAttachmentNative();
    expect(result).toBeInstanceOf(File);
    expect(result).toEqual(expect.objectContaining({ name: 'receipt.png', type: 'image/png', size: 3 }));
    expect(isPickedAttachmentError(result)).toBe(false);
    expect(isPickedAttachmentError({ message: 'invalid' })).toBe(true);
  });
});
