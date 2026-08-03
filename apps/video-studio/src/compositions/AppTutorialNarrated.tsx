import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {BrandBumper} from '../components/BrandBumper';
import {RecordingSlot} from '../components/RecordingSlot';
import {INTRO_FRAMES, OUTRO_FRAMES} from '../constants';
import type {NarrationLine} from '../content/narration';
import type {ClipLayoutItem} from '../lib/clip-layout';

type AppTutorialNarratedProps = {
  layout?: ClipLayoutItem[];
  narration: NarrationLine[];
  locale: 'en' | 'es';
  introTitle?: string;
  introSubtitle?: string;
  outroTitle?: string;
  outroSubtitle?: string;
};

const MUSIC_VOLUME = 0.14;
const SFX_VOLUME = 0.45;
// Slight delay so narration doesn't start exactly on the cut — lets the
// title chip's fade-in and the viewer's eye land on the new screen first.
const NARRATION_DELAY_FRAMES = 12;

/**
 * Narrated variant of the app tutorial — same recordings/layout as
 * AppTutorial, plus a background music bed, a transition whoosh at every
 * clip boundary, and per-clip voiceover (see src/content/narration.ts and
 * scripts/generate-narration.mjs). A separate component from AppTutorial
 * rather than an optional-audio flag on it, so the plain silent cut stays
 * simple and this one is clearly the "with voice + music" variant.
 */
export const AppTutorialNarrated: React.FC<AppTutorialNarratedProps> = ({
  layout = [],
  narration,
  locale,
  introTitle = 'HASHPASS Walkthrough',
  introSubtitle = 'Getting started',
  outroTitle = 'Digital Event Platform',
  outroSubtitle = 'Your Event · Your Community · Your Rewards',
}) => {
  const totalDuration = layout.reduce((sum, item) => sum + item.durationInFrames, 0);

  return (
    <>
      {/* Spans the whole composition; low volume so narration stays clear. */}
      <Audio src={staticFile('audio/music/elegant-bed.mp3')} volume={MUSIC_VOLUME} />

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <BrandBumper title={introTitle} subtitle={introSubtitle} variant="intro" />
        <Audio src={staticFile('audio/sfx/transition.mp3')} volume={SFX_VOLUME} />
      </Sequence>

      {layout.map(({clip, from, durationInFrames}, index) => {
        const line = narration[index];

        return (
          <Sequence key={clip.title} from={INTRO_FRAMES + from} durationInFrames={durationInFrames}>
            <RecordingSlot {...clip} />
            <Audio src={staticFile('audio/sfx/transition.mp3')} volume={SFX_VOLUME} />
            {line ? (
              <Sequence from={NARRATION_DELAY_FRAMES}>
                <Audio src={staticFile(`audio/narration/${locale}/${line.slug}.mp3`)} />
              </Sequence>
            ) : null}
          </Sequence>
        );
      })}

      <Sequence from={INTRO_FRAMES + totalDuration} durationInFrames={OUTRO_FRAMES}>
        <BrandBumper title={outroTitle} subtitle={outroSubtitle} variant="outro" />
        <Audio src={staticFile('audio/sfx/transition.mp3')} volume={SFX_VOLUME} />
      </Sequence>
    </>
  );
};
