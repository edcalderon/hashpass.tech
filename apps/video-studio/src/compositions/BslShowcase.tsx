import React from 'react';
import {Sequence} from 'remotion';
import {BrandBumper} from '../components/BrandBumper';
import {RecordingSlot} from '../components/RecordingSlot';
import {CLIP_FRAMES, INTRO_FRAMES, OUTRO_FRAMES} from '../constants';
import {bslShowcaseClips} from '../content/clips';

export const BslShowcase: React.FC = () => {
  const clips = bslShowcaseClips.length > 0 ? bslShowcaseClips : [{title: 'No clips configured yet'}];

  return (
    <>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <BrandBumper title="BSL On Tour" subtitle="Powered by HASHPASS" variant="intro" />
      </Sequence>

      {clips.map((clip, index) => (
        <Sequence key={clip.title} from={INTRO_FRAMES + index * CLIP_FRAMES} durationInFrames={CLIP_FRAMES}>
          <RecordingSlot {...clip} />
        </Sequence>
      ))}

      <Sequence from={INTRO_FRAMES + clips.length * CLIP_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <BrandBumper title="Get your pass" subtitle="bsl.hashpass.tech" variant="outro" />
      </Sequence>
    </>
  );
};
