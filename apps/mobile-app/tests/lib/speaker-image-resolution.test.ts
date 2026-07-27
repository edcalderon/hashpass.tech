/// <reference types="jest" />

// lib/string-utils.ts pulls in lib/cloudinary.ts, which imports apiClient
// from lib/api-client.ts purely for its (untested-here) upload helper. That
// module transitively reaches into @hashpass/auth's better-auth client,
// which isn't transformable under this project's jest-expo preset. Stub it
// out -- none of the functions under test call apiClient.
jest.mock('../../lib/api-client', () => ({
  apiClient: { post: jest.fn() },
}));

// Under jest.coverage.config.cjs, jest.setup.cjs's global react-native mock
// doesn't provide NativeModules, which the real expo-constants needs at
// import time (it crashes reading NativeModules.EXDevLauncher). Mirrors the
// same minimal mock already used by tests/config/api-client.test.ts.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

import {
  resolveConfiguredSpeakerImage,
  resolveSpeakerImage,
  getSpeakerAvatarUrl,
} from '../../lib/string-utils';

describe('resolveSpeakerImage', () => {
  it('prefers the speaker\'s own configured image over the S3 name-guess lookup', () => {
    expect(resolveSpeakerImage('https://cdn.example.com/foto.png', 'Grace Hopper')).toBe(
      'https://cdn.example.com/foto.png'
    );
  });

  it('falls back to getSpeakerAvatarUrl (S3) when no configured image is set', () => {
    const result = resolveSpeakerImage(undefined, 'Grace Hopper');
    expect(result).toBe(getSpeakerAvatarUrl('Grace Hopper'));
    // Cloudinary is no longer part of this lookup chain -- see getSpeakerAvatarUrl.
    expect(result).not.toContain('cloudinary.com');
    expect(result).toContain('s3');
  });

  it('treats an empty string image as unset, same as undefined', () => {
    expect(resolveSpeakerImage('', 'Grace Hopper')).toBe(getSpeakerAvatarUrl('Grace Hopper'));
  });
});

describe('resolveConfiguredSpeakerImage', () => {
  it('is a deprecated alias of resolveSpeakerImage', () => {
    expect(resolveConfiguredSpeakerImage).toBe(resolveSpeakerImage);
  });
});

describe('getSpeakerAvatarUrl', () => {
  it('never returns a Cloudinary URL', () => {
    // getSpeakerCloudinaryAvatarUrl always returns a URL string regardless of
    // whether the image exists there, and its cloudinaryId duplicates the
    // "speakers/avatars/" path segment -- it was reliably 404ing. This
    // function goes straight to S3, where these images actually live.
    expect(getSpeakerAvatarUrl('Erick Ortiz')).not.toContain('cloudinary.com');
  });

  it('prefers an explicitly provided S3 URL when given one', () => {
    expect(getSpeakerAvatarUrl('Erick Ortiz', 'https://cdn.example.com/erick.png')).toBe(
      'https://cdn.example.com/erick.png'
    );
  });
});
