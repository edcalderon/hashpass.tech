import React from 'react';
import {Composition} from 'remotion';
import {AppTutorial} from './compositions/AppTutorial';
import {AppTutorialNarrated} from './compositions/AppTutorialNarrated';
import {BslShowcase} from './compositions/BslShowcase';
import {CLIP_FRAMES, FPS, HEIGHT, INTRO_FRAMES, OUTRO_FRAMES, WIDTH} from './constants';
import {appTutorialStepsEn, appTutorialStepsEs, bslShowcaseClips} from './content/clips';
import {bslNarrationEn, bslNarrationEs, narrationEn, narrationEs} from './content/narration';
import {layoutClips} from './lib/clip-layout';
import {OpenProof} from './compositions/OpenProof';

// Real recordings vary a lot in length (a landing scroll vs. a 30s OTP
// sign-in with a manual-entry pause), so each composition's duration and
// per-clip Sequence placement are computed from the actual recorded file
// lengths via calculateMetadata, not a fixed per-clip slot. See
// src/lib/clip-layout.ts. The `durationInFrames` prop below is just the
// required initial value before calculateMetadata resolves.

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="OpenProof" component={OpenProof} durationInFrames={2250} fps={30} width={1920} height={1080}/>
      <Composition
        id="BslShowcase"
        component={BslShowcase}
        durationInFrames={INTRO_FRAMES + bslShowcaseClips.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{layout: []}}
        calculateMetadata={async () => {
          const layout = await layoutClips(bslShowcaseClips);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {layout: layout.items},
          };
        }}
      />
      <Composition
        id="AppTutorialEN"
        component={AppTutorial}
        durationInFrames={INTRO_FRAMES + appTutorialStepsEn.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          introTitle: 'HASHPASS Walkthrough',
          introSubtitle: 'Getting started',
          outroTitle: 'Digital Event Platform',
          outroSubtitle: 'Your Event · Your Community · Your Rewards',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(appTutorialStepsEn);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              introTitle: 'HASHPASS Walkthrough',
              introSubtitle: 'Getting started',
              outroTitle: 'Digital Event Platform',
              outroSubtitle: 'Your Event · Your Community · Your Rewards',
            },
          };
        }}
      />
      <Composition
        id="AppTutorialES"
        component={AppTutorial}
        durationInFrames={INTRO_FRAMES + appTutorialStepsEs.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          introTitle: 'Guía de HASHPASS',
          introSubtitle: 'Primeros pasos',
          outroTitle: 'Plataforma Digital de Eventos',
          outroSubtitle: 'Tu Evento · Tu Comunidad · Tus Beneficios',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(appTutorialStepsEs);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              introTitle: 'Guía de HASHPASS',
              introSubtitle: 'Primeros pasos',
              outroTitle: 'Plataforma Digital de Eventos',
              outroSubtitle: 'Tu Evento · Tu Comunidad · Tus Beneficios',
            },
          };
        }}
      />
      <Composition
        id="AppTutorialNarratedEN"
        component={AppTutorialNarrated}
        durationInFrames={INTRO_FRAMES + appTutorialStepsEn.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          narration: narrationEn,
          locale: 'en' as const,
          introTitle: 'HASHPASS Walkthrough',
          introSubtitle: 'Getting started',
          outroTitle: 'Digital Event Platform',
          outroSubtitle: 'Your Event · Your Community · Your Rewards',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(appTutorialStepsEn);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              narration: narrationEn,
              locale: 'en' as const,
              introTitle: 'HASHPASS Walkthrough',
              introSubtitle: 'Getting started',
              outroTitle: 'Digital Event Platform',
              outroSubtitle: 'Your Event · Your Community · Your Rewards',
            },
          };
        }}
      />
      <Composition
        id="AppTutorialNarratedES"
        component={AppTutorialNarrated}
        durationInFrames={INTRO_FRAMES + appTutorialStepsEs.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          narration: narrationEs,
          locale: 'es' as const,
          introTitle: 'Guía de HASHPASS',
          introSubtitle: 'Primeros pasos',
          outroTitle: 'Plataforma Digital de Eventos',
          outroSubtitle: 'Tu Evento · Tu Comunidad · Tus Beneficios',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(appTutorialStepsEs);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              narration: narrationEs,
              locale: 'es' as const,
              introTitle: 'Guía de HASHPASS',
              introSubtitle: 'Primeros pasos',
              outroTitle: 'Plataforma Digital de Eventos',
              outroSubtitle: 'Tu Evento · Tu Comunidad · Tus Beneficios',
            },
          };
        }}
      />
      {/*
        BslShowcaseNarrated reuses AppTutorialNarrated directly rather than a
        separate component — that component isn't actually tutorial-specific
        (it just renders whatever `layout`/`narration` props it's given over
        BrandBumper + RecordingSlot + the music/SFX beds), and the BSL
        recordings aren't split into separate EN/ES visual captures the way
        appTutorialSteps are — both narrated locales dub the same English-UI
        recording, same as demo.tsx's caption translations for non-EN/ES
        locales on the app-tutorial page.
      */}
      <Composition
        id="BslShowcaseNarratedEN"
        component={AppTutorialNarrated}
        durationInFrames={INTRO_FRAMES + bslShowcaseClips.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          narration: bslNarrationEn,
          locale: 'en' as const,
          introTitle: 'BSL On Tour',
          introSubtitle: 'Powered by HASHPASS',
          outroTitle: 'Get your pass',
          outroSubtitle: 'bsl.hashpass.tech',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(bslShowcaseClips);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              narration: bslNarrationEn,
              locale: 'en' as const,
              introTitle: 'BSL On Tour',
              introSubtitle: 'Powered by HASHPASS',
              outroTitle: 'Get your pass',
              outroSubtitle: 'bsl.hashpass.tech',
            },
          };
        }}
      />
      <Composition
        id="BslShowcaseNarratedES"
        component={AppTutorialNarrated}
        durationInFrames={INTRO_FRAMES + bslShowcaseClips.length * CLIP_FRAMES + OUTRO_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{
          layout: [],
          narration: bslNarrationEs,
          locale: 'es' as const,
          introTitle: 'BSL On Tour',
          introSubtitle: 'Con tecnología de HASHPASS',
          outroTitle: 'Consigue tu pase',
          outroSubtitle: 'bsl.hashpass.tech',
        }}
        calculateMetadata={async () => {
          const layout = await layoutClips(bslShowcaseClips);
          return {
            durationInFrames: INTRO_FRAMES + layout.totalDuration + OUTRO_FRAMES,
            props: {
              layout: layout.items,
              narration: bslNarrationEs,
              locale: 'es' as const,
              introTitle: 'BSL On Tour',
              introSubtitle: 'Con tecnología de HASHPASS',
              outroTitle: 'Consigue tu pase',
              outroSubtitle: 'bsl.hashpass.tech',
            },
          };
        }}
      />
    </>
  );
};
