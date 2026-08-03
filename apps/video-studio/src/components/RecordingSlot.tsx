import React from 'react';
import {AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BRAND} from '../constants';
import type {ClipSlot} from '../content/clips';

type RecordingSlotProps = ClipSlot;

/**
 * Renders a recorded screen capture if `src` is present, otherwise a
 * placeholder card. This lets the studio and every composition boot and
 * preview correctly before any real footage has been recorded — drop a
 * file into public/recordings/ and set `src` in src/content/clips.ts to
 * swap the placeholder for the real clip, no other code changes needed.
 */
export const RecordingSlot: React.FC<RecordingSlotProps> = ({src, title, caption, trimStartSeconds}) => {
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
        <div
          style={{
            position: 'absolute',
            left: 48,
            bottom: 48,
            opacity: titleOpacity,
            fontFamily: 'system-ui, sans-serif',
            color: BRAND.white,
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{fontSize: 32, fontWeight: 700}}>{title}</div>
          {caption ? <div style={{fontSize: 20, marginTop: 4, color: BRAND.accentCyan}}>{caption}</div> : null}
        </div>
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
