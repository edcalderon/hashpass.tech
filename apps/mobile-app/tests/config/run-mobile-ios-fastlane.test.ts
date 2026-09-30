/// <reference types="jest" />

const {
  buildIosFastlaneEnv,
  resolveIosBuildNumber,
} = require('../../../../packages/tools/scripts/run-mobile-ios-fastlane.js') as {
  buildIosFastlaneEnv: (options?: {
    baseEnv?: Record<string, string>;
    profile?: string;
    submit?: boolean;
  }) => Record<string, string>;
  resolveIosBuildNumber: (options?: { baseEnv?: Record<string, string> }) => string;
};

describe('run-mobile-ios-fastlane', () => {
  it('uses the CI build number for the iOS archive', () => {
    expect(resolveIosBuildNumber({ baseEnv: { GITHUB_RUN_NUMBER: '481' } })).toBe('481');
  });

  it('builds a TestFlight environment without exposing API-key material', () => {
    const env = buildIosFastlaneEnv({
      profile: 'production',
      baseEnv: {
        EAS_BUILD_PROFILE: 'production',
        EAS_PROJECT_ID: 'fixture-eas-production-project-id',
        EXPO_OWNER: 'hashpasstechs-team',
        GITHUB_RUN_NUMBER: '481',
      },
    });

    expect(env.MOBILE_RELEASE_BACKEND).toBe('fastlane');
    expect(env.FASTLANE_PLATFORM).toBe('ios');
    expect(env.FASTLANE_IOS_LANE).toBe('testflight');
    expect(env.IOS_BUILD_NUMBER).toBe('481');
    expect(env.CI).toBe('1');
    expect(env.APP_STORE_CONNECT_API_KEY_P8).toBeUndefined();
  });
});
