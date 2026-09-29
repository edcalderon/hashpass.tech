import React from 'react';
import {AbsoluteFill, Img, interpolate, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';

const DURATION = 360;
const SCENE_DURATION = DURATION / 3;

const scenes = [
  {
    file: 'discovery/bogota-aerial-pexels.mp4',
    label: 'Bogotá',
    startFrom: 120,
    type: 'video',
  },
  {file: 'discovery/medellin-panorama.jpg', label: 'Medellín'},
  {file: 'discovery/santiago-skyline.jpg', label: 'Santiago'},
];

/**
 * A quiet, photo-led geographic montage for the Explorer's discovery chapter.
 * The Explorer itself supplies the copy and controls, so this composition
 * remains a purely atmospheric background and never implies a pictured venue
 * is a specific Hashpass event location.
 */
export const DiscoveryCoverLoop: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{backgroundColor: '#06111F', overflow: 'hidden'}}>
      {scenes.map((scene, index) => {
        const start = index * SCENE_DURATION;
        const end = start + SCENE_DURATION;
        const opacity = interpolate(
          frame,
          [start, start + 18, end - 18, end],
          [0, 1, 1, 0],
          {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
        );
        const progress = interpolate(frame, [start, end], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const direction = index % 2 === 0 ? 1 : -1;

        return (
          <AbsoluteFill key={scene.file} style={{opacity}}>
            {scene.type === 'video' ? (
              <OffthreadVideo
                muted
                src={staticFile(scene.file)}
                startFrom={scene.startFrom}
                style={{
                  filter: 'saturate(.82) contrast(1.08) brightness(.72)',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${1.05 + progress * 0.025})`,
                  transformOrigin: 'center',
                  width: '100%',
                }}
              />
            ) : (
              <Img
                src={staticFile(scene.file)}
                style={{
                  filter: 'saturate(.82) contrast(1.08) brightness(.72)',
                  height: '100%',
                  objectFit: 'cover',
                  transform: `scale(${1.05 + progress * 0.075}) translateX(${direction * progress * 1.6}%)`,
                  transformOrigin: 'center',
                  width: '100%',
                }}
              />
            )}
            <AbsoluteFill
              style={{
                background: 'linear-gradient(90deg, rgba(6,17,31,.78) 0%, rgba(6,17,31,.42) 48%, rgba(6,17,31,.12) 100%)',
              }}
            />
            <div
              style={{
                borderLeft: '2px solid rgba(143,211,255,.68)',
                height: '66%',
                left: '72%',
                opacity: 0.7,
                position: 'absolute',
                top: '17%',
                transform: `translateX(${Math.sin((frame / DURATION) * Math.PI * 2) * 9}px)`,
                width: 1,
              }}
            />
            <div
              style={{
                bottom: 62,
                color: 'rgba(255,255,255,.78)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: 4,
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
          background: 'linear-gradient(180deg, rgba(6,17,31,.04) 0%, rgba(6,17,31,.12) 55%, rgba(6,17,31,.52) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
