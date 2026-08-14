import React from 'react';
import {AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame} from 'remotion';

const COBALT = '#046BD2';
const MIDNIGHT = '#06111F';

/** A muted, date-neutral CLF 2026 hero loop derived from the 2025 event reel. */
export const ClfHeroLoop: React.FC = () => {
  const frame = useCurrentFrame();
  const labelOpacity = interpolate(frame, [10, 28, 810, 870], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const labelOffset = interpolate(frame, [10, 40], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{backgroundColor: MIDNIGHT, overflow: 'hidden'}}
      durationInFrames={824}
      trimBefore={76}>
      <OffthreadVideo
        src={staticFile('brand/criptolatinfest/criptolatinfest-2026-hero.mp4')}
        volume={0}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(90deg, rgba(6,17,31,0.82) 0%, rgba(6,17,31,0.34) 48%, rgba(6,17,31,0.12) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 92,
          bottom: 88,
          opacity: labelOpacity,
          transform: `translateY(${labelOffset}px)`,
          color: '#FFFFFF',
          fontFamily: 'Space Grotesk, sans-serif',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            border: `1px solid ${COBALT}`,
            borderRadius: 999,
            color: '#8FD3FF',
            display: 'inline-flex',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 3,
            padding: '10px 18px',
          }}
        >
          CLF 2026
        </div>
        <div style={{fontSize: 74, fontWeight: 700, letterSpacing: '-0.05em', lineHeight: 0.98, marginTop: 20}}>
          Cripto Latin Fest
        </div>
        <div style={{color: '#B8CAE0', fontSize: 28, fontWeight: 400, letterSpacing: '0.02em', marginTop: 16}}>
          Bogotá · 27–28 August 2026
        </div>
      </div>
    </AbsoluteFill>
  );
};
