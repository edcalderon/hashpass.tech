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

/**
 * The startup label intentionally exposes only the release version. Commit
 * hashes are useful diagnostics in the version details sheet, but they make
 * the first-run loader look like an internal build and are noisy on narrow
 * mobile screens.
 */
export const getStartupStamp = (): string => `v${packageJson.version}`;
