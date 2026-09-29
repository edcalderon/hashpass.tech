import React from 'react';
import {AbsoluteFill, interpolate, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';

const DURATION = 360;
const SCENE_DURATION = DURATION / 3;

const scenes = [
  {file: 'partners/speaker-conference-pexels.mp4', label: 'Ideas on stage', startFrom: 42},
  {file: 'partners/stage-audience-pexels.mp4', label: 'Community in the room', startFrom: 54},
  {file: 'partners/concert-crowd-pexels.mp4', label: 'Shared energy', startFrom: 90},
];

/**
 * Silent, people-led background for the Partners chapter. The dashboard owns
 * all partner copy, so no external event identity is asserted by this edit.
 */
export const PartnersCoverLoop: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: '#07111F', overflow: 'hidden'}}>
      {scenes.map((scene, index) => {
        const start = index * SCENE_DURATION;
        const end = start + SCENE_DURATION;
        const opacity = interpolate(
          frame,
          [start, start + 16, end - 16, end],
          [0, 1, 1, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
        const progress = interpolate(frame, [start, end], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <AbsoluteFill key={scene.file} style={{opacity}}>
            <OffthreadVideo
              muted
              src={staticFile(scene.file)}
              startFrom={scene.startFrom}
              style={{
                filter: 'saturate(.72) contrast(1.08) brightness(.58)',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${1.06 + progress * 0.025})`,
                transformOrigin: 'center',
                width: '100%',
              }}
            />
            <AbsoluteFill
              style={{
                background: 'linear-gradient(90deg, rgba(7,17,31,.86) 0%, rgba(7,17,31,.55) 46%, rgba(7,17,31,.18) 100%)',
              }}
            />
            <div
              style={{
                borderLeft: '2px solid rgba(143,211,255,.52)',
                bottom: '17%',
                height: '62%',
                opacity: .72,
                position: 'absolute',
                right: '22%',
                transform: `translateX(${Math.sin((frame / DURATION) * Math.PI * 2) * 8}px)`,
                width: 1,
              }}
            />
            <div
              style={{
                bottom: 62,
                color: 'rgba(255,255,255,.7)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: 3,
                position: 'absolute',
                right: 70,
                textTransform: 'uppercase',
              }}
            >
              {scene.label}
            </div>
          </AbsoluteFill>
        );
      })}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(7,17,31,.04) 0%, rgba(7,17,31,.14) 58%, rgba(7,17,31,.56) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
