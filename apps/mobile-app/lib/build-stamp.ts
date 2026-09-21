import packageJson from '../package.json';

/**
 * Shortens a long identifier (git SHA, build id) to "head...tail" -- the
 * same shape already used elsewhere in the app for wallet addresses and pass
 * numbers (see TestimonialsColumns.tsx, PassesDisplay.tsx). Shorter here
 * (4/4 vs. the 6/4 used for addresses) since a build stamp only needs to be
 * spot-checkable against a CI log, not disambiguate on its own.
 *
 * A value too short to usefully shorten (or one that would leave nothing
 * hidden by truncating) is returned unchanged.
 */
export const truncateBuildIdentifier = (value: string, headChars = 4, tailChars = 4): string => {
  if (value.length <= headChars + tailChars + 1) return value;
  return `${value.slice(0, headChars)}...${value.slice(-tailChars)}`;
};

const releaseCommit = process.env.EXPO_PUBLIC_RELEASE_COMMIT;

/**
 * `v1.9.47 · a1b2...9f3d` (or `local build` outside CI). Single source for
 * the startup build stamp shown under the loading message on app boot and
 * on the `/` route -- was previously duplicated (and untruncated) in
 * app/_layout.tsx and app/index.tsx.
 */
export const getStartupStamp = (): string =>
  releaseCommit
    ? `v${packageJson.version} · ${truncateBuildIdentifier(releaseCommit)}`
    : `v${packageJson.version} · local build`;
