/** Scenes of the intro film. Words live in the catalogs as film.<id>.title and film.<id>.line. */
import type { FilmScene } from '../types.ts';

export const filmScenes: FilmScene[] = [
  { id: 's1', sprite: 'hatchling', icon: 'star' },
  { id: 's2', sprite: 'curious', icon: 'chat' },
  { id: 's3', sprite: 'helpful', icon: 'calendar' },
  { id: 's4', sprite: 'helpful', icon: 'heart' },
  { id: 's5', sprite: 'hatchling', icon: 'key' },
];

/** How long a caption stays up when nothing is being spoken: a floor plus time per character (kana and kanji read slower per glyph). */
export function readingMs(text: string, lang: string): number {
  return Math.max(4200, Math.round(text.length * (lang === 'ja' ? 210 : 75)));
}
