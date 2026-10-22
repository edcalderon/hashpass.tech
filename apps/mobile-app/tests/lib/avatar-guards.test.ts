import {
  AvatarGuardError,
  isAllowedAvatarUrl,
  sniffImageType,
  validateAvatarBytes,
  validateAvatarMetadata,
} from '../../lib/avatar-guards';

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as AvatarGuardError).code;
  }
  return null;
};

describe('avatar guards', () => {
  it('accepts a normal image and normalizes image/jpg', () => {
    expect(validateAvatarMetadata({ name: 'me.png', mimeType: 'image/png', size: 1000, width: 512, height: 512 })).toBe('image/png');
    expect(validateAvatarMetadata({ name: 'me.jpg', mimeType: 'image/jpg' })).toBe('image/jpeg');
  });

  it('rejects empty, oversized, and wrong-type files', () => {
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.png', size: 0 }))).toBe('empty');
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.png', size: 6 * 1024 * 1024 }))).toBe('too_large');
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.gif', mimeType: 'image/gif' }))).toBe('type_not_allowed');
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.avif', mimeType: 'image/avif' }))).toBe('type_not_allowed');
    expect(codeOf(() => validateAvatarMetadata({ name: 'noext', mimeType: 'image/png' }))).toBe('type_not_allowed');
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.png', mimeType: 'image/jpeg' }))).toBe('content_mismatch');
  });

  it('rejects dimensions outside the allowed range', () => {
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.png', width: 5000, height: 100 }))).toBe('dimensions_too_large');
    expect(codeOf(() => validateAvatarMetadata({ name: 'a.png', width: 32, height: 32 }))).toBe('dimensions_too_small');
  });

  it('identifies formats from their bytes and rejects disguised files', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')]);
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(webp)).toBe('image/webp');
    expect(sniffImageType(Buffer.from('<svg xmlns'))).toBeNull();
    expect(codeOf(() => validateAvatarBytes(Buffer.from('<svg xmlns'), 'image/png'))).toBe('unreadable');
    expect(codeOf(() => validateAvatarBytes(jpeg, 'image/png'))).toBe('content_mismatch');
    expect(codeOf(() => validateAvatarBytes(png, 'image/png'))).toBeNull();
  });

  it('only allows HTTPS URLs from hosts the app produces', () => {
    expect(isAllowedAvatarUrl('https://lh3.googleusercontent.com/a/x')).toBe(true);
    expect(isAllowedAvatarUrl('https://cdn.hashpass.tech/a.png')).toBe(true);
    expect(isAllowedAvatarUrl('http://cdn.hashpass.tech/a.png')).toBe(false);
    expect(isAllowedAvatarUrl('https://evil.example/a.png')).toBe(false);
    expect(isAllowedAvatarUrl('https://user:pw@cdn.hashpass.tech/a.png')).toBe(false);
    expect(isAllowedAvatarUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedAvatarUrl(42)).toBe(false);
  });
});
