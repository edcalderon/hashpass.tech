import React from 'react';
import { Platform } from 'react-native';
import CloudinaryImageUpload from '../../components/CloudinaryImageUpload';

const mockUploadImage = jest.fn();
const mockRequestPermission = jest.fn();
const mockLaunchPicker = jest.fn();

jest.mock('../../lib/cloudinary', () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
}));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchPicker(...args),
}));

const { act, create } = require('react-test-renderer');

const pressUpload = (renderer: ReturnType<typeof create>) => {
  const label = renderer.root.findByProps({ children: 'Upload Image' });
  let node: any = label;
  while (node && typeof node.props?.onPress !== 'function') node = node.parent;
  if (!node) throw new Error('Upload button not found');
  node.props.onPress();
};

describe('CloudinaryImageUpload', () => {
  const originalPlatform = Platform.OS;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    mockRequestPermission.mockResolvedValue({ granted: true });
    mockLaunchPicker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///avatar.png', fileName: 'avatar.png', mimeType: 'image/png' }],
    });
    mockUploadImage.mockResolvedValue({ secure_url: 'https://cdn.example/avatar.png' });
  });

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    globalThis.fetch = originalFetch;
  });

  it('uploads a native picker URI part and returns the Cloudinary result', async () => {
    const onUploadSuccess = jest.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CloudinaryImageUpload onUploadSuccess={onUploadSuccess} />);
    });

    await act(async () => {
      pressUpload(renderer!);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockUploadImage).toHaveBeenCalledWith({
      uri: 'file:///avatar.png',
      name: 'avatar.png',
      type: 'image/png',
    }, expect.objectContaining({
      folder: 'speakers/avatars',
      uploadPreset: 'speaker_avatars',
    }));
    expect(onUploadSuccess).toHaveBeenCalledWith({ secure_url: 'https://cdn.example/avatar.png' });
  });

  it('stops before opening the picker when permission is denied', async () => {
    mockRequestPermission.mockResolvedValueOnce({ granted: false });
    const onUploadError = jest.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CloudinaryImageUpload onUploadError={onUploadError} />);
    });

    await act(async () => {
      pressUpload(renderer!);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLaunchPicker).not.toHaveBeenCalled();
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
  const pickAndExpectRejection = async (asset: Record<string, unknown>) => {
    mockLaunchPicker.mockResolvedValueOnce({ canceled: false, assets: [asset] });
    const onUploadError = jest.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CloudinaryImageUpload onUploadError={onUploadError} />);
    });
    await act(async () => {
      pressUpload(renderer!);
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    expect(mockUploadImage).not.toHaveBeenCalled();
    return onUploadError;
  };

  it('rejects images over the size limit before uploading', async () => {
    const onUploadError = await pickAndExpectRejection({
      uri: 'file:///big.png', fileName: 'big.png', mimeType: 'image/png', fileSize: 8 * 1024 * 1024,
    });
    expect(onUploadError).toHaveBeenCalledWith(expect.objectContaining({ code: 'too_large' }));
  });

  it('rejects unsupported formats and oversized dimensions', async () => {
    const typeError = await pickAndExpectRejection({
      uri: 'file:///a.gif', fileName: 'a.gif', mimeType: 'image/gif',
    });
    expect(typeError).toHaveBeenCalledWith(expect.objectContaining({ code: 'type_not_allowed' }));
    const sizeError = await pickAndExpectRejection({
      uri: 'file:///a.png', fileName: 'a.png', mimeType: 'image/png', width: 9000, height: 9000,
    });
    expect(sizeError).toHaveBeenCalledWith(expect.objectContaining({ code: 'dimensions_too_large' }));
  });

  it('checks a web file by its real bytes, not its name', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const onUploadError = jest.fn();
    const onUploadSuccess = jest.fn();
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<CloudinaryImageUpload onUploadError={onUploadError} onUploadSuccess={onUploadSuccess} />);
    });
    const input = renderer!.root.findByType('input' as any);
    expect(input.props.accept).toBe('image/jpeg,image/png,image/webp');

    const disguised = new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')], { type: 'image/png' });
    Object.defineProperty(disguised, 'name', { value: 'logo.png' });
    await act(async () => {
      input.props.onChange({ target: { files: [disguised] } });
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    expect(mockUploadImage).not.toHaveBeenCalled();
    expect(onUploadError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unreadable' }));

    const real = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], { type: 'image/png' });
    Object.defineProperty(real, 'name', { value: 'ok.png' });
    await act(async () => {
      input.props.onChange({ target: { files: [real] } });
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    expect(mockUploadImage).toHaveBeenCalledTimes(1);
  });
});
