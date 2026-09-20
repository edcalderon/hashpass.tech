import React from 'react';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
export default function DesignSystemStyles() {
  const { isDark } = useTheme(); const palette = uiPalette(isDark);
  return <style>{`
    :root { color-scheme: ${isDark ? 'dark' : 'light'}; }
    ::selection { background: ${palette.accentSoft}; color: ${palette.text}; }
    :where(button,[role="button"],input,textarea,select,a):focus-visible { outline: 2px solid ${palette.accent}; outline-offset: 3px; }
    :where(input,textarea) { caret-color: ${palette.accent}; }
    :where(button,[role="button"],a) { touch-action: manipulation; }
    @media (prefers-reduced-motion: reduce) { .hp-illustration .hp-detail { animation: none !important; } }
    .hp-control { min-height: ${uiTokens.control.minHeight}px; border-radius: ${uiTokens.radius.pill}px; }
  `}</style>;
}
