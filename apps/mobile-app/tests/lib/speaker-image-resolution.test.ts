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
  getSpeakerCloudinaryAvatarUrl,
  getSpeakerAvatarUrl,
} from '../../lib/string-utils';

describe('resolveConfiguredSpeakerImage', () => {
  it('prefers the speaker\'s own configured image over any lookup', () => {
    expect(resolveConfiguredSpeakerImage('https://cdn.example.com/foto.png', 'Ada Lovelace')).toBe(
      'https://cdn.example.com/foto.png'
    );
  });

  it('falls back to the Cloudinary lookup when no configured image is set', () => {
    expect(resolveConfiguredSpeakerImage(undefined, 'Ada Lovelace')).toBe(
      getSpeakerCloudinaryAvatarUrl('Ada Lovelace')
    );
  });

  it('treats an empty string image as unset, same as undefined', () => {
    expect(resolveConfiguredSpeakerImage('', 'Ada Lovelace')).toBe(
      getSpeakerCloudinaryAvatarUrl('Ada Lovelace')
    );
  });
});

describe('resolveSpeakerImage', () => {
  it('prefers the speaker\'s own configured image over the name-guess lookup', () => {
    expect(resolveSpeakerImage('https://cdn.example.com/foto.png', 'Grace Hopper')).toBe(
      'https://cdn.example.com/foto.png'
    );
  });

  it('falls back to getSpeakerAvatarUrl when no configured image is set', () => {
    expect(resolveSpeakerImage(undefined, 'Grace Hopper')).toBe(getSpeakerAvatarUrl('Grace Hopper'));
  });

  it('treats an empty string image as unset, same as undefined', () => {
    expect(resolveSpeakerImage('', 'Grace Hopper')).toBe(getSpeakerAvatarUrl('Grace Hopper'));
  });
});
