import React, { useRef } from 'react';
import './LukasGlyph.css';
import type { LukasGlyphName, LukasGlyphProps, LukasGlyphTone } from '../../types/lukas.types';
import { useLukasAnimationLevel, useSceneActivity } from './useLukasMotion';

// Tiles stay deep enough that the white pictogram keeps >= 3:1 contrast.
const TONES: Record<Exclude<LukasGlyphName, 'token'>, LukasGlyphTone> = {
  coffee: { a: '#E08A12', b: '#9A4308', glow: 'rgba(224,138,18,.55)', delay: '-1s' },
  event: { a: '#D97706', b: '#8F3A08', glow: 'rgba(217,119,6,.5)', delay: '-2.2s' },
  market: { a: '#1FAE6B', b: '#0A6443', glow: 'rgba(31,174,107,.5)', delay: '-3.1s' },
  network: { a: '#1FA3D4', b: '#0E4F9E', glow: 'rgba(31,163,212,.5)', delay: '-.4s' },
  reserve: { a: '#22B573', b: '#0B6B49', glow: 'rgba(34,181,115,.5)', delay: '-4s' },
  shield: { a: '#2BB673', b: '#0A6A42', glow: 'rgba(43,182,115,.5)', delay: '-1.7s' },
  settings: { a: '#5B86DD', b: '#2D4A99', glow: 'rgba(91,134,221,.45)', delay: '-2.8s' },
  wallet: { a: '#7C5CE6', b: '#4527A8', glow: 'rgba(124,92,230,.5)', delay: '-3.6s' },
};

const ICONS: Record<Exclude<LukasGlyphName, 'token'>, React.ReactNode> = {
  coffee: <>
    <path className="lk-steam lk-steam--1" d="M17 8.5c-2 2.4 2 4 0 7" />
    <path className="lk-steam lk-steam--2" d="M24 6.5c-2 2.4 2 4 0 7" />
    <path className="lk-steam lk-steam--3" d="M31 8.5c-2 2.4 2 4 0 7" />
    <path className="lk-fill" d="M10 21h25v9a9 9 0 0 1-9 9h-7a9 9 0 0 1-9-9v-9Z" />
    <path d="M35 24h2.5a4.5 4.5 0 0 1 0 9H34" />
  </>,
  event: <>
    <rect className="lk-fill" x="8" y="11" width="32" height="29" rx="6" />
    <path d="M8 20h32M16 7v8M32 7v8" />
    <circle className="lk-dot lk-dot--1 lk-solid" cx="17" cy="28" r="2.2" />
    <circle className="lk-dot lk-dot--2 lk-solid" cx="24" cy="28" r="2.2" />
    <circle className="lk-dot lk-dot--3 lk-solid" cx="31" cy="28" r="2.2" />
    <circle className="lk-dot lk-dot--4 lk-solid" cx="17" cy="34" r="2.2" />
    <circle className="lk-dot lk-dot--5 lk-solid" cx="24" cy="34" r="2.2" />
  </>,
  market: <>
    <path className="lk-fill" d="M9 23v17h30V23" />
    <path d="M20 40V31h8v9" />
    <g className="lk-awning">
      <path className="lk-fill" d="M6 19 10 8h28l4 11Z" />
      <path d="M6 19a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0" />
    </g>
  </>,
  network: <>
    <path className="lk-link" d="M17 27.5 31 18.5M17 30.5 31 33.5M35 21v8" />
    <circle className="lk-node lk-node--1 lk-fill" cx="12" cy="29" r="5.5" />
    <circle className="lk-node lk-node--2 lk-fill" cx="36" cy="14" r="5.5" />
    <circle className="lk-node lk-node--3 lk-fill" cx="36" cy="36" r="5.5" />
    <circle className="lk-solid" cx="12" cy="29" r="2" /><circle className="lk-solid" cx="36" cy="14" r="2" /><circle className="lk-solid" cx="36" cy="36" r="2" />
  </>,
  reserve: <>
    <path className="lk-fill" d="M10 31v6c0 2.8 6.3 5 14 5s14-2.2 14-5v-6" />
    <path className="lk-fill" d="M10 23v8c0 2.8 6.3 5 14 5s14-2.2 14-5v-8" />
    <g className="lk-stack-top">
      <path className="lk-fill" d="M10 14v9c0 2.8 6.3 5 14 5s14-2.2 14-5v-9" />
      <ellipse className="lk-fill" cx="24" cy="14" rx="14" ry="5" />
      <path d="M20 14h8" />
    </g>
  </>,
  shield: <>
    <path className="lk-fill" d="M24 5 39 10.500v11c0 9.200-6 16.200-15 20.500C15 37.700 9 30.700 9 21.500v-11L24 5Z" />
    <path className="lk-check" pathLength={1} d="m16.500 24 5 5 10-11" />
  </>,
  settings: <>
    <g className="lk-spin">
      <circle className="lk-fill" cx="24" cy="24" r="10" />
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.900 9.900l4.200 4.200M33.900 33.900l4.200 4.200M38.100 9.900l-4.200 4.200M14.100 33.900l-4.200 4.200" />
    </g>
    <circle className="lk-solid" cx="24" cy="24" r="3.5" />
  </>,
  wallet: <g className="lk-wallet">
    <rect className="lk-fill" x="7" y="12" width="34" height="27" rx="6" />
    <path d="M7 19V16a4 4 0 0 1 4-4h22" />
    <path className="lk-fill" d="M41 24H31a4.500 4.500 0 0 0 0 9h10" />
    <circle className="lk-clasp lk-solid" cx="31.500" cy="28.500" r="2" />
  </g>,
};

/** Animated pictograms; `token` is the real 3D-styled LKS coin artwork. */
export function LukasGlyph({ name, size = 64, animationLevel }: LukasGlyphProps) {
  const ref = useRef<HTMLDivElement>(null);
  const pageLevel = useLukasAnimationLevel();
  const level = animationLevel ?? pageLevel;
  useSceneActivity(ref);

  if (name === 'token') {
    return (
      <div ref={ref} className="lk-glyph lk-glyph--coin" data-active="false" data-motion={level} aria-hidden="true" style={{ '--s': `${size}px`, '--lk-delay': '-2s' } as React.CSSProperties}>
        <div className="lk-glyph__body">
          <img className="lk-glyph__coin" src="/coins/lukas-coin.svg" alt="" width="512" height="512" draggable={false} />
        </div>
      </div>
    );
  }

  const tone = TONES[name];
  return (
    <div ref={ref} className="lk-glyph" data-active="false" data-motion={level} aria-hidden="true" style={{ '--s': `${size}px`, '--lk-a': tone.a, '--lk-b': tone.b, '--lk-glow': tone.glow, '--lk-delay': tone.delay } as React.CSSProperties}>
      <div className="lk-glyph__body">
        <div className="lk-glyph__tile" />
        <svg className="lk-glyph__icon" viewBox="0 0 48 48" focusable="false">{ICONS[name]}</svg>
      </div>
    </div>
  );
}
