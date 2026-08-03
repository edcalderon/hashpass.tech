import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BRAND} from '../constants';

type BrandBumperProps = {
  title: string;
  subtitle?: string;
  variant?: 'intro' | 'outro';
};

export const BrandBumper: React.FC<BrandBumperProps> = ({title, subtitle, variant = 'intro'}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const logoScale = spring({frame, fps, config: {damping: 200}});
  const textOpacity = interpolate(frame, [10, 30], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 20, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'},
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: BRAND.black,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <Img
        src={staticFile('brand/logo-full-hashpass-white.svg')}
        style={{width: 520, transform: `scale(${logoScale})`}}
      />
      <div
        style={{
          marginTop: 40,
          opacity: textOpacity,
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <div style={{fontSize: 42, fontWeight: 700, color: BRAND.white}}>{title}</div>
        {subtitle ? (
          <div style={{fontSize: 24, marginTop: 12, color: BRAND.accentCyan}}>{subtitle}</div>
        ) : null}
      </div>
      {variant === 'outro' ? (
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 22,
            color: BRAND.white,
            opacity: textOpacity,
          }}
        >
          hashpass.tech
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
