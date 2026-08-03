import React from 'react';
import {Sequence} from 'remotion';
import {BrandBumper} from '../components/BrandBumper';
import {RecordingSlot} from '../components/RecordingSlot';
import {CLIP_FRAMES, INTRO_FRAMES, OUTRO_FRAMES} from '../constants';
import {appTutorialSteps} from '../content/clips';

export const AppTutorial: React.FC = () => {
  const steps = appTutorialSteps.length > 0 ? appTutorialSteps : [{title: 'No steps configured yet'}];

  return (
    <>
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <BrandBumper title="HASHPASS Walkthrough" subtitle="Getting started" variant="intro" />
      </Sequence>

      {steps.map((step, index) => (
        <Sequence key={step.title} from={INTRO_FRAMES + index * CLIP_FRAMES} durationInFrames={CLIP_FRAMES}>
          <RecordingSlot {...step} />
        </Sequence>
      ))}

      <Sequence from={INTRO_FRAMES + steps.length * CLIP_FRAMES} durationInFrames={OUTRO_FRAMES}>
        <BrandBumper title="Get HASHPASS" subtitle="hashpass.tech" variant="outro" />
      </Sequence>
    </>
  );
};
