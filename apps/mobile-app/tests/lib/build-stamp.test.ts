/// <reference types="jest" />

// build-stamp.ts reads EXPO_PUBLIC_RELEASE_COMMIT and package.json's version
// once at module scope, so each case needs a fresh module load with the env
// var set beforehand -- same pattern as tests/lib/ipquery.test.ts.
const loadBuildStamp = () => {
  jest.resetModules();
  return require('../../lib/build-stamp');
};

describe('build-stamp', () => {
  const originalReleaseCommit = process.env.EXPO_PUBLIC_RELEASE_COMMIT;

  afterEach(() => {
    if (originalReleaseCommit === undefined) {
      delete process.env.EXPO_PUBLIC_RELEASE_COMMIT;
    } else {
      process.env.EXPO_PUBLIC_RELEASE_COMMIT = originalReleaseCommit;
    }
  });

  describe('truncateBuildIdentifier', () => {
    it('shortens a long identifier to head...tail', () => {
      const { truncateBuildIdentifier } = loadBuildStamp();
      expect(truncateBuildIdentifier('a1b2c3d4e5f6789f3d')).toBe('a1b2...9f3d');
    });

    it('returns a value unchanged when truncating would hide nothing', () => {
      const { truncateBuildIdentifier } = loadBuildStamp();
      // length 9 === headChars(4) + tailChars(4) + 1, the equality boundary
      expect(truncateBuildIdentifier('123456789')).toBe('123456789');
      expect(truncateBuildIdentifier('short')).toBe('short');
    });

    it('honors custom head/tail lengths', () => {
      const { truncateBuildIdentifier } = loadBuildStamp();
      expect(truncateBuildIdentifier('abcdefghijklmnop', 2, 3)).toBe('ab...nop');
    });
  });

  describe('getStartupStamp', () => {
    it('includes the truncated release commit when EXPO_PUBLIC_RELEASE_COMMIT is set', () => {
      process.env.EXPO_PUBLIC_RELEASE_COMMIT = 'a1b2c3d4e5f6789f3d';
      const { getStartupStamp } = loadBuildStamp();
      const packageJson = require('../../package.json');
      expect(getStartupStamp()).toBe(`v${packageJson.version} · a1b2...9f3d`);
    });

    it('falls back to "local build" when EXPO_PUBLIC_RELEASE_COMMIT is unset', () => {
      delete process.env.EXPO_PUBLIC_RELEASE_COMMIT;
      const { getStartupStamp } = loadBuildStamp();
      const packageJson = require('../../package.json');
      expect(getStartupStamp()).toBe(`v${packageJson.version} · local build`);
    });
  });
});
