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
});
