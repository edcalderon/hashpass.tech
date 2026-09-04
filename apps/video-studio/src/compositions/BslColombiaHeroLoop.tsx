import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const GOLD = '#F5C542';
const MIDNIGHT = '#06111F';

/**
 * BSL Colombia 2026 hero loop. Unlike ClfHeroLoop, there is no real venue
 * footage to composite — the event (Nov 5-6 2026) hasn't happened yet and
 * Blockchain Summit Latam's own colombia2026 page has no video assets to
 * re-host either. Same brand-graphics approach as OpenProof: pure
 * spring/interpolate motion over the shared BSL midnight background, using
 * colombia2026's own brand color instead of hardcoding another event's.
 *
 * No baked-in text: confirmed live against EventBanner (the actual
 * heroVideo consumer) that it already overlays its own badge/title/date on
 * top of whatever background video plays — cbweek2026's real shipped hero
 * (the only other wired-up heroVideo) is plain footage for the same reason.
 * An earlier version of this composition baked in its own text and produced
 * a visible double/ghosted title when checked live.
 */
export const BslColombiaHeroLoop: React.FC = () => {
  const frame = useCurrentFrame();

  // Slow diagonal drift on the glow so the loop reads as alive without any
  // footage, and without the always-on-CPU risk a live CSS animation would
  // carry on native (see project_drawer_full_width_close_bug memory) — this
  // is pre-rendered to a static mp4, so the cost is paid once at render time.
  const driftX = interpolate(frame, [0, 300], [-6, 6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const driftY = interpolate(frame, [0, 300], [4, -4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{backgroundColor: MIDNIGHT, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #06111F 0%, #0B1E33 55%, #06111F 100%)',
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${62 + driftX}% ${38 + driftY}%, rgba(245,197,66,0.42) 0%, rgba(245,197,66,0.14) 34%, rgba(6,17,31,0) 64%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'linear-gradient(90deg, rgba(6,17,31,0.9) 0%, rgba(6,17,31,0.45) 48%, rgba(6,17,31,0.2) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
