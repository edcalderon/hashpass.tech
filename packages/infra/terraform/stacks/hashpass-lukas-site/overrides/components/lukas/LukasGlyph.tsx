import React, { useRef } from 'react';
import './LukasGlyph.css';
import type { LukasGlyphName, LukasGlyphProps } from '../../types/lukas.types';
import { useTheme } from '../../hooks/useTheme';
import { lukasPalette } from './lukas-ui';
import { useLukasAnimationLevel, useSceneActivity } from './useLukasMotion';

const ICONS: Record<Exclude<LukasGlyphName, 'token'>, React.ReactNode> = {
  coffee: <>
    <path d="M17 8.5c-2 2.4 2 4 0 7" />
    <path d="M24 6.5c-2 2.4 2 4 0 7" />
    <path d="M31 8.5c-2 2.4 2 4 0 7" />
    <path className="lk-fill" d="M10 21h25v9a9 9 0 0 1-9 9h-7a9 9 0 0 1-9-9v-9Z" />
    <path d="M35 24h2.5a4.5 4.5 0 0 1 0 9H34" />
  </>,
  event: <>
    <rect className="lk-fill" x="8" y="11" width="32" height="29" rx="6" />
    <path d="M8 20h32M16 7v8M32 7v8" />
    <circle className="lk-solid" cx="17" cy="28" r="2.2" />
    <circle className="lk-solid" cx="24" cy="28" r="2.2" />
    <circle className="lk-solid" cx="31" cy="28" r="2.2" />
    <circle className="lk-solid" cx="17" cy="34" r="2.2" />
    <circle className="lk-solid" cx="24" cy="34" r="2.2" />
  </>,
  market: <>
    <path className="lk-fill" d="M9 23v17h30V23" />
    <path d="M20 40V31h8v9" />
    <g>
      <path className="lk-fill" d="M6 19 10 8h28l4 11Z" />
      <path d="M6 19a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0a4.5 4.5 0 0 0 9 0" />
    </g>
  </>,
  network: <>
    <path className="lk-link" d="M17 27.5 31 18.5M17 30.5 31 33.5M35 21v8" />
    <circle className="lk-fill" cx="12" cy="29" r="5.5" />
    <circle className="lk-fill" cx="36" cy="14" r="5.5" />
    <circle className="lk-fill" cx="36" cy="36" r="5.5" />
    <circle className="lk-solid" cx="12" cy="29" r="2" /><circle className="lk-solid" cx="36" cy="14" r="2" /><circle className="lk-solid" cx="36" cy="36" r="2" />
  </>,
  reserve: <>
    <path className="lk-fill" d="M10 31v6c0 2.8 6.3 5 14 5s14-2.2 14-5v-6" />
    <path className="lk-fill" d="M10 23v8c0 2.8 6.3 5 14 5s14-2.2 14-5v-8" />
    <g>
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
    <g>
      <circle className="lk-fill" cx="24" cy="24" r="10" />
      <path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.900 9.900l4.200 4.200M33.900 33.900l4.200 4.200M38.100 9.900l-4.200 4.200M14.100 33.900l-4.200 4.200" />
    </g>
    <circle className="lk-solid" cx="24" cy="24" r="3.5" />
  </>,
  wallet: <g>
    <rect className="lk-fill" x="7" y="12" width="34" height="27" rx="6" />
    <path d="M7 19V16a4 4 0 0 1 4-4h22" />
    <path className="lk-fill" d="M41 24H31a4.500 4.500 0 0 0 0 9h10" />
    <circle className="lk-solid" cx="31.500" cy="28.500" r="2" />
  </g>,
};

/** Shared navy/emerald line pictograms; `token` remains the LKS coin artwork. */
export function LukasGlyph({ name, size = 64, animationLevel }: LukasGlyphProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { isDark } = useTheme();
  const palette = lukasPalette(isDark);
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

  return (
    <div
      ref={ref}
      className="lk-glyph"
      data-active="false"
      data-motion={level}
      aria-hidden="true"
      style={{
        '--s': `${size}px`,
        '--lk-ink': palette.text,
        '--lk-accent': palette.accent,
      } as React.CSSProperties}
    >
      <div className="lk-glyph__body">
        <svg className="lk-glyph__icon" viewBox="0 0 48 48" focusable="false">{ICONS[name]}</svg>
      </div>
    </div>
  );
}
