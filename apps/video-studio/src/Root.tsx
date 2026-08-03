import React from 'react';
import {Composition} from 'remotion';
import {AppTutorial} from './compositions/AppTutorial';
import {BslShowcase} from './compositions/BslShowcase';
import {CLIP_FRAMES, FPS, HEIGHT, INTRO_FRAMES, OUTRO_FRAMES, WIDTH} from './constants';
import {appTutorialSteps, bslShowcaseClips} from './content/clips';
import {layoutClips} from './lib/clip-layout';

// Real recordings vary a lot in length (a landing scroll vs. a 30s OTP
// sign-in with a manual-entry pause), so each composition's duration and
// per-clip Sequence placement are computed from the actual recorded file
// lengths via calculateMetadata, not a fixed per-clip slot. See
// src/lib/clip-layout.ts. The `durationInFrames` prop below is just the
// required initial value before calculateMetadata resolves.

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BslShowcase"
        component={BslShowcase}
        durationInFrames={INTRO_FRAMES + bslShowcaseClips.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        calculateMetadata={async () => {
          const layout = await layoutClips(bslShowcaseClips);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {layout: layout.items},
          };
        }}
      />
      <Composition
        id="AppTutorial"
        component={AppTutorial}
        durationInFrames={INTRO_FRAMES + appTutorialSteps.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        calculateMetadata={async () => {
          const layout = await layoutClips(appTutorialSteps);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {layout: layout.items},
          };
        }}
      />
    </>
  );
};
