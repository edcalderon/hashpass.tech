import React from 'react';

type PlayStoreBadgeProps = {
  opacity: number;
  eyebrow?: string;
  label?: string;
};

/**
 * A stylized "available on Google Play" badge — an original recreation of
 * the standard store-badge layout (eyebrow + play-triangle + wordmark), not
 * a trace of Google's trademarked artwork. Swap in the official badge asset
 * before this ships anywhere public-facing.
 */
export const PlayStoreBadge: React.FC<PlayStoreBadgeProps> = ({
  opacity,
  eyebrow = 'GET IT ON',
  label = 'Google Play',
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        right: 32,
        bottom: 32,
        opacity,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#000000',
        border: '1px solid rgba(255,255,255,0.25)',
        borderRadius: 10,
        padding: '10px 20px 10px 16px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="5" fill="url(#playGradient)" />
        <path d="M9.5 7L17 12L9.5 17V7Z" fill="white" />
        <defs>
          <linearGradient id="playGradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#00D2FF" />
            <stop offset="0.5" stopColor="#00F76A" />
            <stop offset="1" stopColor="#FFD500" />
          </linearGradient>
        </defs>
      </svg>
      <div>
        <div style={{fontSize: 11, letterSpacing: 0.5, color: '#cccccc'}}>{eyebrow}</div>
        <div style={{fontSize: 19, fontWeight: 600, color: '#ffffff', lineHeight: 1.15}}>{label}</div>
      </div>
    </div>
  );
};
