/// <reference types="jest" />

jest.mock('../../../../packages/tools/scripts/run-mobile-eas.js', () => ({
  runEas: jest.fn(() => ({ status: 0 })),
}));

jest.mock('../../../../packages/tools/scripts/run-mobile-fastlane.js', () => ({
  runFastlane: jest.fn(),
  runFastlanePromote: jest.fn(),
}));

const {
  buildReleaseArgs,
  normalizeReleaseEnvironment,
  normalizeReleaseBackend,
  parseReleaseArgs,
  resolveReleaseProfile,
  runRelease,
} = require('../../../../packages/tools/scripts/run-mobile-release.js') as {
  buildReleaseArgs: (options?: {
    env?: string;
    profile?: string | null;
    submit?: boolean;
  }) => string[];
  normalizeReleaseEnvironment: (value?: string) => string;
  normalizeReleaseBackend: (value?: string) => string;
  parseReleaseArgs: (argv?: string[]) => {
    env: string;
    profile: string | null;
    submit: boolean;
    backend: string;
    track: string | null;
    promoteTo: string | null;
    releaseStatus: string | null;
  };
  resolveReleaseProfile: (options?: {
    env?: string;
    profile?: string | null;
  }) => string;
  runRelease: (options?: {
    env?: string;
    profile?: string | null;
    submit?: boolean;
    backend?: string;
    track?: string | null;
    promoteTo?: string | null;
    releaseStatus?: string | null;
  }) => unknown;
};

const originalMobileReleaseTrack = process.env.MOBILE_RELEASE_TRACK;
const originalFastlaneReleaseStatus = process.env.FASTLANE_RELEASE_STATUS;
const originalMobileReleaseStatus = process.env.MOBILE_RELEASE_RELEASE_STATUS;

beforeEach(() => {
  delete process.env.MOBILE_RELEASE_TRACK;
  delete process.env.FASTLANE_RELEASE_STATUS;
  delete process.env.MOBILE_RELEASE_RELEASE_STATUS;
});

afterAll(() => {
  if (originalMobileReleaseTrack === undefined) {
    delete process.env.MOBILE_RELEASE_TRACK;
  } else {
    process.env.MOBILE_RELEASE_TRACK = originalMobileReleaseTrack;
  }

  if (originalFastlaneReleaseStatus === undefined) {
    delete process.env.FASTLANE_RELEASE_STATUS;
  } else {
    process.env.FASTLANE_RELEASE_STATUS = originalFastlaneReleaseStatus;
  }

  if (originalMobileReleaseStatus === undefined) {
    delete process.env.MOBILE_RELEASE_RELEASE_STATUS;
  } else {
    process.env.MOBILE_RELEASE_RELEASE_STATUS = originalMobileReleaseStatus;
  }
});

describe('run-mobile-release', () => {
  it('normalizes release environments', () => {
    expect(normalizeReleaseEnvironment()).toBe('production');
    expect(normalizeReleaseEnvironment('prod')).toBe('production');
    expect(normalizeReleaseEnvironment('development')).toBe('development');
    expect(normalizeReleaseEnvironment('preview')).toBe('development');
  });

  it('normalizes release backends', () => {
    expect(normalizeReleaseBackend()).toBe('fastlane');
    expect(normalizeReleaseBackend('eas')).toBe('eas');
    expect(normalizeReleaseBackend('expo')).toBe('eas');
    expect(normalizeReleaseBackend('fastlane')).toBe('fastlane');
    expect(normalizeReleaseBackend('local')).toBe('fastlane');
  });

  it('parses env, backend, and submit flags', () => {
    expect(parseReleaseArgs(['--env', 'development', '--backend', 'fastlane', '--no-submit'])).toEqual({
      env: 'development',
      profile: null,
      submit: false,
      backend: 'fastlane',
      track: null,
      promoteTo: null,
      releaseStatus: null,
    });
    expect(parseReleaseArgs(['--track', 'alpha'])).toMatchObject({
      track: 'alpha',
    });
    expect(parseReleaseArgs(['--profile', 'development'])).toEqual({
      env: 'production',
      profile: 'development',
      submit: true,
      backend: 'fastlane',
      track: null,
      promoteTo: null,
      releaseStatus: null,
    });
  });

  it('parses the promote-only track target', () => {
    expect(parseReleaseArgs(['--env', 'development', '--track', 'internal', '--promote-to', 'alpha'])).toEqual({
      env: 'development',
      profile: null,
      submit: true,
      backend: 'fastlane',
      track: 'internal',
      promoteTo: 'alpha',
      releaseStatus: null,
    });
  });

  it('defaults release parsing to fastlane when no backend is provided', () => {
    expect(parseReleaseArgs([])).toMatchObject({
      env: 'production',
      submit: true,
      backend: 'fastlane',
    });
  });

  it('maps the release env to the correct eas profile', () => {
    expect(resolveReleaseProfile({ env: 'production' })).toBe('production');
    expect(resolveReleaseProfile({ env: 'development' })).toBe('preview');
    expect(resolveReleaseProfile({ env: 'development', profile: 'development' })).toBe('development');
  });

  it('builds release args for production and development flows', () => {
    expect(buildReleaseArgs()).toEqual([
      'build',
      '--platform',
      'android',
      '--profile',
      'production',
      '--auto-submit',
    ]);
    expect(buildReleaseArgs({ env: 'development' })).toEqual([
      'build',
      '--platform',
      'android',
      '--profile',
      'preview',
      '--auto-submit',
    ]);
    expect(buildReleaseArgs({ env: 'development', profile: 'development', submit: false })).toEqual([
      'build',
      '--platform',
      'android',
      '--profile',
      'development',
    ]);
  });

  it('dispatches to fastlane when the backend is set to fastlane', () => {
    const { runFastlane } = require('../../../../packages/tools/scripts/run-mobile-fastlane.js') as {
      runFastlane: jest.Mock;
    };

    runRelease({
      env: 'development',
      backend: 'fastlane',
      submit: true,
    });

    expect(runFastlane).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'preview',
        submit: true,
      }),
    );
  });

  it('dispatches to the fastlane promote path when promote-to is set', () => {
    const { runFastlanePromote } = require('../../../../packages/tools/scripts/run-mobile-fastlane.js') as {
      runFastlanePromote: jest.Mock;
    };

    runRelease({
      env: 'development',
      backend: 'fastlane',
      track: 'internal',
      promoteTo: 'alpha',
      releaseStatus: 'draft',
    });

    expect(runFastlanePromote).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'preview',
        track: 'internal',
        promoteTo: 'alpha',
        releaseStatus: 'draft',
      }),
    );
  });

  it('rejects promote-only releases on non-fastlane backends', () => {
    expect(() =>
      runRelease({
        env: 'development',
        backend: 'eas',
        track: 'internal',
        promoteTo: 'alpha',
      }),
    ).toThrow('Promotion-only releases are only supported with the fastlane backend.');
  });

  it('uses the mobile release track env fallback when present', () => {
    const originalTrack = process.env.MOBILE_RELEASE_TRACK;
    process.env.MOBILE_RELEASE_TRACK = 'alpha';

    try {
      expect(parseReleaseArgs([])).toMatchObject({
        track: 'alpha',
      });
    } finally {
      if (originalTrack === undefined) {
        delete process.env.MOBILE_RELEASE_TRACK;
      } else {
        process.env.MOBILE_RELEASE_TRACK = originalTrack;
      }
    }
  });

  it('uses the fastlane release status env fallback when present', () => {
    const originalStatus = process.env.FASTLANE_RELEASE_STATUS;
    process.env.FASTLANE_RELEASE_STATUS = 'draft';

    try {
      expect(parseReleaseArgs([])).toMatchObject({
        releaseStatus: 'draft',
      });
    } finally {
      if (originalStatus === undefined) {
        delete process.env.FASTLANE_RELEASE_STATUS;
      } else {
        process.env.FASTLANE_RELEASE_STATUS = originalStatus;
      }
    }
  });
});
