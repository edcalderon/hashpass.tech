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
