import React from 'react';
import {Sequence} from 'remotion';
import {BrandBumper} from '../components/BrandBumper';
import {RecordingSlot} from '../components/RecordingSlot';
import {INTRO_FRAMES, OUTRO_FRAMES} from '../constants';
import {bslShowcaseClips} from '../content/clips';
import type {ClipLayoutItem} from '../lib/clip-layout';

type BslShowcaseProps = {
  layout?: ClipLayoutItem[];
};

// Fallback so this still renders sensibly if ever mounted without the
// calculateMetadata-provided layout (e.g. a future unit test).
const fallbackLayout: ClipLayoutItem[] = bslShowcaseClips.map((clip, index) => ({
  clip,
  from: index * 150,
  durationInFrames: 150,
}));

export const BslShowcase: React.FC<BslShowcaseProps> = ({layout = fallbackLayout}) => {
  const totalDuration = layout.reduce((sum, item) => sum + item.durationInFrames, 0);

  return (
    <>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <BrandBumper title="BSL On Tour" subtitle="Powered by HASHPASS" variant="intro" />
      </Sequence>

      {layout.map(({clip, from, durationInFrames}) => (
        <Sequence key={clip.title} from={INTRO_FRAMES + from} durationInFrames={durationInFrames}>
          <RecordingSlot {...clip} />
        </Sequence>
      ))}

      <Sequence from={INTRO_FRAMES + totalDuration} durationInFrames={OUTRO_FRAMES}>
        <BrandBumper title="Get your pass" subtitle="bsl.hashpass.tech" variant="outro" />
      </Sequence>
    </>
  );
};
