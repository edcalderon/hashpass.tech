import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import type {EventHeroSpec} from '../content/event-hero-specs';
import {EVENT_HERO_DURATION_IN_FRAMES} from '../content/event-hero-specs';

const MIDNIGHT = '#06111F';

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const seededUnit = (source: string, index: number): number => {
  let hash = 2166136261;
  for (const character of `${source}:${index}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
};

/**
 * A silent, seamless hero loop for use below live EventBanner copy. It uses
 * only approved HASHPASS/event lockups and abstract city architecture, so it
 * never invents people, event dates, speakers, or venue imagery.
 */
export const EventHeroLoop: React.FC<EventHeroSpec> = ({
  id,
  city,
  venue,
  accentColor,
  eventLogo,
}) => {
  const frame = useCurrentFrame();
  const cycle = (frame / EVENT_HERO_DURATION_IN_FRAMES) * Math.PI * 2;
  const logoFloat = Math.sin(cycle) * 6;
  const beamOffset = Math.sin(cycle) * 12;
  const cityKey = `${id}:${city}:${venue}`;

  return (
    <AbsoluteFill style={{backgroundColor: MIDNIGHT, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${68 + beamOffset * 0.18}% ${30 + beamOffset * 0.12}%, ${hexToRgba(accentColor, 0.42)} 0%, ${hexToRgba(accentColor, 0.14)} 30%, rgba(6, 17, 31, 0) 64%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(118deg, rgba(6,17,31,0.96) 2%, rgba(6,17,31,0.68) 48%, ${hexToRgba(accentColor, 0.2)} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(6,17,31,0.02) 0%, rgba(6,17,31,0.08) 46%, rgba(6,17,31,0.42) 100%)',
        }}
      />
      <svg
        viewBox="0 0 1920 570"
        preserveAspectRatio="none"
        style={{bottom: 0, height: '53%', left: 0, position: 'absolute', width: '100%'}}
      >
        <defs>
          <linearGradient id={`city-${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.66" />
            <stop offset="80%" stopColor="#091827" stopOpacity="0.98" />
          </linearGradient>
        </defs>
        {Array.from({length: 20}, (_, index) => {
          const width = 70 + seededUnit(cityKey, index) * 90;
          const height = 90 + seededUnit(cityKey, index + 50) * 360;
          const left = index * 104 - 60;
          const top = 570 - height;
          const windowAlpha = 0.26 + seededUnit(cityKey, index + 100) * 0.4;
          return (
            <g key={index}>
              <rect
                fill={`url(#city-${id})`}
                height={height}
                stroke={accentColor}
                strokeOpacity="0.56"
                strokeWidth="2"
                width={width}
                x={left}
                y={top}
              />
              {Array.from({length: 5}, (_, row) => (
                <line
                  key={row}
                  opacity={windowAlpha}
                  stroke={accentColor}
                  strokeWidth="5"
                  x1={left + width * 0.2}
                  x2={left + width * 0.8}
                  y1={top + 30 + row * ((height - 48) / 5)}
                  y2={top + 30 + row * ((height - 48) / 5)}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div
        style={{
          background: `linear-gradient(90deg, transparent, ${hexToRgba(accentColor, 0.48)}, transparent)`,
          height: 2,
          left: 0,
          opacity: interpolate(Math.sin(cycle), [-1, 1], [0.25, 0.8]),
          position: 'absolute',
          top: '68%',
          transform: `translateX(${Math.sin(cycle) * 130}px)`,
          width: '100%',
        }}
      />
      <div
        style={{
          alignItems: 'flex-end',
          display: 'flex',
          gap: 28,
          position: 'absolute',
          right: 92,
          top: 78,
          transform: `translateY(${logoFloat}px)`,
        }}
      >
        <Img
          src={staticFile('brand/logo-full-hashpass-white.svg')}
          style={{
            filter: 'brightness(0) invert(1)',
            height: 52,
            objectFit: 'contain',
            opacity: 0.96,
            width: 276,
          }}
        />
        <div
          style={{
            background: 'rgba(6, 17, 31, 0.42)',
            border: `1px solid ${hexToRgba(accentColor, 0.64)}`,
            borderRadius: 18,
            boxShadow: `0 14px 42px ${hexToRgba(accentColor, 0.18)}`,
            padding: '16px 22px',
          }}
        >
          <Img
            src={staticFile(eventLogo.target)}
            style={{height: 82, objectFit: 'contain', width: 210}}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
