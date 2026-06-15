/// <reference types="jest" />

const {
  buildReleaseArgs,
  normalizeReleaseEnvironment,
  parseReleaseArgs,
  resolveReleaseProfile,
} = require('../../../../packages/tools/scripts/run-mobile-release.js') as {
  buildReleaseArgs: (options?: {
    env?: string;
    profile?: string | null;
    submit?: boolean;
  }) => string[];
  normalizeReleaseEnvironment: (value?: string) => string;
  parseReleaseArgs: (argv?: string[]) => {
    env: string;
    profile: string | null;
    submit: boolean;
  };
  resolveReleaseProfile: (options?: {
    env?: string;
    profile?: string | null;
  }) => string;
};

describe('run-mobile-release', () => {
  it('normalizes release environments', () => {
    expect(normalizeReleaseEnvironment()).toBe('production');
    expect(normalizeReleaseEnvironment('prod')).toBe('production');
    expect(normalizeReleaseEnvironment('development')).toBe('development');
    expect(normalizeReleaseEnvironment('preview')).toBe('development');
  });

  it('parses env and submit flags', () => {
    expect(parseReleaseArgs(['--env', 'development', '--no-submit'])).toEqual({
      env: 'development',
      profile: null,
      submit: false,
    });
    expect(parseReleaseArgs(['--profile', 'development'])).toEqual({
      env: 'production',
      profile: 'development',
      submit: true,
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
});
