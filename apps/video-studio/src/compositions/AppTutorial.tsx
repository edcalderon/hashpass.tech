import React from 'react';
import {Sequence} from 'remotion';
import {BrandBumper} from '../components/BrandBumper';
import {RecordingSlot} from '../components/RecordingSlot';
import {INTRO_FRAMES, OUTRO_FRAMES} from '../constants';
import {appTutorialStepsEn} from '../content/clips';
import type {ClipLayoutItem} from '../lib/clip-layout';

type AppTutorialProps = {
  layout?: ClipLayoutItem[];
  introTitle?: string;
  introSubtitle?: string;
  outroTitle?: string;
  outroSubtitle?: string;
};

// Fallback so this still renders sensibly if ever mounted without the
// calculateMetadata-provided layout (e.g. a future unit test).
const fallbackLayout: ClipLayoutItem[] = appTutorialStepsEn.map((clip, index) => ({
  clip,
  from: index * 150,
  durationInFrames: 150,
}));

export const AppTutorial: React.FC<AppTutorialProps> = ({
  layout = fallbackLayout,
  introTitle = 'HASHPASS Walkthrough',
  introSubtitle = 'Getting started',
  outroTitle = 'Get HASHPASS',
  outroSubtitle = 'hashpass.tech',
}) => {
  const totalDuration = layout.reduce((sum, item) => sum + item.durationInFrames, 0);

  return (
    <>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <BrandBumper title={introTitle} subtitle={introSubtitle} variant="intro" />
      </Sequence>

      {layout.map(({clip, from, durationInFrames}) => (
        <Sequence key={clip.title} from={INTRO_FRAMES + from} durationInFrames={durationInFrames}>
          <RecordingSlot {...clip} />
        </Sequence>
      ))}

      <Sequence from={INTRO_FRAMES + totalDuration} durationInFrames={OUTRO_FRAMES}>
        <BrandBumper title={outroTitle} subtitle={outroSubtitle} variant="outro" />
      </Sequence>
    </>
  );
};
