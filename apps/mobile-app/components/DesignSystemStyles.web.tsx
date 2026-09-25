import React from 'react';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
export default function DesignSystemStyles() {
  const { isDark } = useTheme(); const palette = uiPalette(isDark);
  return <style>{`
    :root { color-scheme: ${isDark ? 'dark' : 'light'}; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    html, body, #root { width: 100%; min-height: 100%; min-height: 100dvh; overflow-x: hidden; overflow-x: clip; }
    html { overscroll-behavior-x: none; }
    body { margin: 0; -webkit-tap-highlight-color: transparent; }
    ::selection { background: ${palette.accentSoft}; color: ${palette.text}; }
    :where(button,[role="button"],input,textarea,select,a):focus-visible { outline: 2px solid ${palette.accent}; outline-offset: 3px; }
    :where(input,textarea) { caret-color: ${palette.accent}; }
    :where(button,[role="button"],a) { touch-action: manipulation; }
    @media (max-width: 600px) { :where(input,textarea,select) { font-size: max(16px, 1em); } }
    @media (display-mode: standalone) { html, body, #root { overscroll-behavior: none; min-height: 100dvh; } }
    @media (prefers-reduced-motion: reduce) { .hp-illustration .hp-detail { animation: none !important; } }
    .hp-control { min-height: ${uiTokens.control.minHeight}px; border-radius: ${uiTokens.radius.pill}px; }
  `}</style>;
}
