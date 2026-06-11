'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@hashpass/i18n';
import { useTheme } from './ThemeProvider';

export function ScrollToTop() {
  const { t } = useTranslation('hero');
  const { resolvedTheme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [bottom, setBottom] = useState(36);
  const isDark = resolvedTheme === 'dark';

  const scrollColor = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(13,23,40,0.32)';
  const scrollDot   = isDark ? '#ffffff' : '#0d1728';

  useEffect(() => {
    const GAP = 16; // px gap to keep above footer

    const update = () => {
      const scrollY = window.scrollY;
      setVisible(scrollY > 300);

      // Dynamically lift the button above the footer when it scrolls into view
      const footer = document.querySelector('footer');
      if (footer) {
        const footerTop = footer.getBoundingClientRect().top;
        const vp = window.innerHeight;
        if (footerTop < vp) {
          // Footer is partially visible — push button up by the amount it overlaps
          setBottom(vp - footerTop + GAP);
        } else {
          setBottom(GAP + 20); // default resting position
        }
      }
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Scroll to top"
      style={{
        position: 'fixed',
        bottom,
        right: 'clamp(20px, 4vw, 40px)',
        zIndex: 50,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 8,
        color: scrollColor,
        transition: 'bottom 0.25s ease, opacity 0.3s',
        animation: 'scroll-fade-in 0.4s ease both',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.65'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >
      <div style={{
        width: 22, height: 36, borderRadius: 11,
        border: `1.5px solid ${scrollColor}`,
        position: 'relative', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: 4, height: 8, borderRadius: 2,
          background: scrollDot,
          animation: 'scroll-dot-reverse 1.8s ease-in-out infinite',
        }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>
        {t('scrollUp')}
      </span>

      <style>{`
        @keyframes scroll-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scroll-dot-reverse {
          0%,100% { transform: translateY(0); opacity: 1; }
          50%      { transform: translateY(-12px); opacity: 0.28; }
        }
      `}</style>
    </button>
  );
}
