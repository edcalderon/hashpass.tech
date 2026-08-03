import {getVideoMetadata} from '@remotion/media-utils';
import {staticFile} from 'remotion';
import {CLIP_FRAMES, FPS} from '../constants';
import type {ClipSlot} from '../content/clips';

export type ClipLayoutItem = {
  clip: ClipSlot;
  from: number;
  durationInFrames: number;
};

export type ClipLayout = {
  items: ClipLayoutItem[];
  totalDuration: number;
};

/**
 * Sizes each clip's Sequence to the real recording's length (via
 * getVideoMetadata) instead of a fixed placeholder duration, since real
 * captures vary wildly — a landing-page scroll is ~10s, an OTP/Google
 * sign-in recording with a manual-entry pause can run 30s+. Clips without a
 * `src` yet (still showing the "recording pending" card) fall back to
 * CLIP_FRAMES. Runs inside `calculateMetadata`, which Remotion awaits
 * before mounting the composition — see Root.tsx.
 */
export async function layoutClips(clips: ClipSlot[]): Promise<ClipLayout> {
  const resolvedClips = clips.length > 0 ? clips : [{title: 'No steps configured yet'} satisfies ClipSlot];

  let cursor = 0;
  const items: ClipLayoutItem[] = [];

  for (const clip of resolvedClips) {
    let durationInFrames = CLIP_FRAMES;

    if (clip.src) {
      try {
        const metadata = await getVideoMetadata(staticFile(`recordings/${clip.src}`));
        durationInFrames = Math.max(1, Math.round(metadata.durationInSeconds * FPS));
      } catch (error) {
        console.warn(`Could not read duration for recordings/${clip.src}, using placeholder length.`, error);
      }
    }

    items.push({clip, from: cursor, durationInFrames});
    cursor += durationInFrames;
  }

  return {items, totalDuration: cursor};
}
