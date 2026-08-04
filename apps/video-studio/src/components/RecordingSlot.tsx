import React from 'react';
import {AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BRAND} from '../constants';
import type {ClipSlot} from '../content/clips';
import {PlayStoreBadge} from './PlayStoreBadge';

type RecordingSlotProps = ClipSlot;

/**
 * Renders a recorded screen capture if `src` is present, otherwise a
 * placeholder card. This lets the studio and every composition boot and
 * preview correctly before any real footage has been recorded — drop a
 * file into public/recordings/ and set `src` in src/content/clips.ts to
 * swap the placeholder for the real clip, no other code changes needed.
 */
export const RecordingSlot: React.FC<RecordingSlotProps> = ({
  src,
  title,
  caption,
  trimStartSeconds,
  showPlayStoreBadge,
  titleCorner = 'top-left',
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});

  if (src) {
    return (
      <AbsoluteFill style={{backgroundColor: BRAND.black}}>
        <OffthreadVideo
          src={staticFile(`recordings/${src}`)}
          startFrom={Math.round((trimStartSeconds ?? 0) * fps)}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
        {/* On an opaque chip so it stays readable regardless of what's
            under it (a white page background made earlier white-text takes
            unreadable). Corner defaults top-left, clear of the app's own
            PWA-install button which floats bottom-left on every recorded
            page — but that button's own *expanded* card also renders
            top-left, so clips showing it override to top-right instead. */}
        <div
          style={{
            position: 'absolute',
            [titleCorner === 'top-right' ? 'right' : 'left']: 32,
            top: 32,
            opacity: titleOpacity,
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: 'rgba(10,10,10,0.82)',
            borderRadius: 12,
            padding: '14px 22px',
            textAlign: titleCorner === 'top-right' ? 'right' : 'left',
          }}
        >
          <div style={{fontSize: 30, fontWeight: 700, color: BRAND.white}}>{title}</div>
          {caption ? <div style={{fontSize: 18, marginTop: 4, color: BRAND.accentCyan}}>{caption}</div> : null}
        </div>
        {showPlayStoreBadge ? <PlayStoreBadge opacity={titleOpacity} /> : null}
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#141414',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          border: `2px dashed ${BRAND.accentCyan}`,
          borderRadius: 16,
          padding: '48px 64px',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          opacity: titleOpacity,
        }}
      >
        <div style={{fontSize: 28, color: BRAND.white, fontWeight: 600}}>{title}</div>
        <div style={{fontSize: 18, marginTop: 12, color: '#888'}}>Recording pending — drop a clip in public/recordings/</div>
      </div>
    </AbsoluteFill>
  );
};
