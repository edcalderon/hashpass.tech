const HERO_TAGLINE_SEPARATOR = " ";

export const stripHeroTaglineDecoration = (value: string): string =>
  value
    .replace(/^\s*-\s*/, "")
    .replace(/\s*-\s*$/, "")
    .trim();

export const resolveHeroTaglineWords = (words: string[]): string[] =>
  words.map(stripHeroTaglineDecoration).filter((word) => word.length > 0);

export const resolveHeroTaglineText = (
  words: string[],
  separator: string = HERO_TAGLINE_SEPARATOR,
  decorate: boolean = false,
): string => {
  const cleanedWords = resolveHeroTaglineWords(words);

  if (cleanedWords.length > 0) {
    const text = cleanedWords.join(separator);
    return decorate ? `- ${text} -` : text;
  }

  return words[0]?.trim() || "";
};
