const HERO_TAGLINE_SEPARATOR = " ";

export const stripHeroTaglineDecoration = (value: string): string =>
  value
    .replace(/^\s*-\s*/, "")
    .replace(/\s*-\s*$/, "")
    .trim();

export const resolveHeroTaglineText = (
  words: string[],
  separator: string = HERO_TAGLINE_SEPARATOR,
): string => {
  const cleanedWords = words
    .map(stripHeroTaglineDecoration)
    .filter((word) => word.length > 0);

  if (cleanedWords.length > 0) {
    return cleanedWords.join(separator);
  }

  return words[0]?.trim() || "";
};
