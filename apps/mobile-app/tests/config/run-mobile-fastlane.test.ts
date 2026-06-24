/// <reference types="jest" />

const {
  buildFastlaneEnv,
  normalizeFastlaneTrack,
  resolveFastlaneTrack,
} = require('../../../../packages/tools/scripts/run-mobile-fastlane.js') as {
  buildFastlaneEnv: (options?: {
    baseEnv?: Record<string, string>;
    profile?: string;
    track?: string | null;
    releaseStatus?: string;
  }) => Record<string, string>;
  normalizeFastlaneTrack: (value?: string) => string | null;
  resolveFastlaneTrack: (options?: { profile?: string; track?: string | null }) => string;
};

describe('run-mobile-fastlane', () => {
  it('normalizes fastlane tracks', () => {
    expect(normalizeFastlaneTrack()).toBeNull();
    expect(normalizeFastlaneTrack('internal')).toBe('internal');
    expect(normalizeFastlaneTrack('alpha')).toBe('alpha');
    expect(normalizeFastlaneTrack('production')).toBe('production');
  });

  it('defaults the track from the release profile', () => {
    expect(resolveFastlaneTrack({ profile: 'production' })).toBe('production');
    expect(resolveFastlaneTrack({ profile: 'preview' })).toBe('internal');
    expect(resolveFastlaneTrack({ profile: 'preview', track: 'alpha' })).toBe('alpha');
    expect(resolveFastlaneTrack({ profile: 'preview', track: 'production' })).toBe('production');
  });

  it('builds a fastlane environment with a stable local Android version code', () => {
    const env = buildFastlaneEnv({
      profile: 'production',
      track: 'alpha',
      baseEnv: {
        EAS_BUILD_PROFILE: 'production',
        EAS_PROJECT_ID: 'f710aa31-82ef-4ee3-82a3-068b0fad04dc',
        EXPO_OWNER: 'hashpasss-team',
        MOBILE_ANDROID_VERSION_CODE: '123456',
      },
    });

    expect(env.MOBILE_RELEASE_BACKEND).toBe('fastlane');
    expect(env.EXPO_USE_LOCAL_VERSIONING).toBe('1');
    expect(env.FASTLANE_TRACK).toBe('alpha');
    expect(env.FASTLANE_RELEASE_STATUS).toBe('completed');
    expect(env.MOBILE_ANDROID_VERSION_CODE).toBe('123456');
    expect(env.ANDROID_VERSION_CODE).toBe('123456');
    expect(env.CI).toBe('1');
    expect(env.EAS_BUILD_PROFILE).toBe('production');
  });
});
