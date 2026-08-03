import React from 'react';
import {Composition} from 'remotion';
import {AppTutorial} from './compositions/AppTutorial';
import {BslShowcase} from './compositions/BslShowcase';
import {CLIP_FRAMES, FPS, HEIGHT, INTRO_FRAMES, OUTRO_FRAMES, WIDTH} from './constants';
import {appTutorialSteps, bslShowcaseClips} from './content/clips';

const durationFor = (slotCount: number) => INTRO_FRAMES + Math.max(slotCount, 1) * CLIP_FRAMES + OUTRO_FRAMES;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="BslShowcase"
        component={BslShowcase}
        durationInFrames={durationFor(bslShowcaseClips.length)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="AppTutorial"
        component={AppTutorial}
        durationInFrames={durationFor(appTutorialSteps.length)}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
