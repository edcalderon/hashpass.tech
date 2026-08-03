import narrationData from './narration.json';

/**
 * Narration lines for the narrated AppTutorial variant — one per tutorial
 * step, spoken over that clip. JSON-backed so
 * scripts/generate-narration.mjs (plain Node, no TS loader) can read the
 * exact same source of truth when synthesizing audio via edge-tts
 * (Microsoft Edge's free neural TTS, no API key) into
 * public/audio/narration/{en,es}/<slug>.mp3.
 */
export type NarrationLine = {
  slug: string;
  text: string;
};

export const narrationEn: NarrationLine[] = narrationData.en;
export const narrationEs: NarrationLine[] = narrationData.es;

// BslShowcaseNarrated's lines live in the same narration.json (slugs
// prefixed `bsl-` to avoid colliding with the app-tutorial slugs above) so
// generate-narration.mjs synthesizes both variants' audio from one source
// of truth — filtered here into the 3-line order BslShowcaseNarrated's
// layout expects (event landing, agenda browse, meeting request).
export const bslNarrationEn: NarrationLine[] = narrationEn.filter((line) => line.slug.startsWith('bsl-'));
export const bslNarrationEs: NarrationLine[] = narrationEs.filter((line) => line.slug.startsWith('bsl-'));
