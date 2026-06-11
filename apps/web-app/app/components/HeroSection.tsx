'use client';

import { useRef } from 'react';
import { useTranslation } from '@hashpass/i18n';
import { ShaderBackground } from './ShaderBackground';
import { useTheme } from './ThemeProvider';
import {
  ContainerScroll,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
} from '@/components/blocks/animated-gallery';

// ── HashPass event / club / membership photography ───────────────────────────
const COL_1 = [
  'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=900&auto=format&fit=crop&q=70',
];
const COL_2 = [
  'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?w=900&auto=format&fit=crop&q=70',
];
const COL_3 = [
  'https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&auto=format&fit=crop&q=70',
  'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=900&auto=format&fit=crop&q=70',
];

export function HeroSection() {
  const { t } = useTranslation('hero');
  const { resolvedTheme } = useTheme();
  const galleryRef = useRef<HTMLDivElement>(null);
  const isDark = resolvedTheme === 'dark';

  // ── Hero text colors ────────────────────────────────────────────────────────
  const headlineColor = isDark ? '#ffffff'                 : '#0d1728';
  const subtitleColor = isDark ? 'rgba(245,247,251,0.78)' : 'rgba(13,23,40,0.72)';
  const badgeBorder   = isDark ? 'rgba(41,121,255,0.45)'  : 'rgba(25,118,210,0.35)';
  const badgeBg       = isDark ? 'rgba(41,121,255,0.14)'  : 'rgba(25,118,210,0.10)';
  const badgeDot      = isDark ? '#2979ff'                : '#1976d2';
  const badgeText     = isDark ? '#90caf9'                : '#1565c0';
  const scrollColor   = isDark ? 'rgba(255,255,255,0.42)' : 'rgba(13,23,40,0.32)';
  const scrollDot     = isDark ? '#ffffff'                : '#0d1728';

  // ── Gallery grid background — in sync with hero palette ────────────────────
  const gridLineColor = isDark
    ? 'rgba(41, 121, 255, 0.07)'   // electric blue tint on dark
    : '#f0f0f0';                   // neutral gray on light (matches reference)

  const radial1 = isDark
    ? 'radial-gradient(circle 700px at 90% 5%, rgba(41,121,255,0.22), transparent)'
    : 'radial-gradient(circle 800px at 100% 200px, #d5c5ff, transparent)';

  const radial2 = isDark
    ? 'radial-gradient(circle 500px at 8% 90%, rgba(233,30,140,0.14), transparent)'
    : 'radial-gradient(circle 600px at 0% 100%, rgba(233,30,140,0.07), transparent)';

  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* ── Shader hero ─────────────────────────────────────────────────────── */}
      <ShaderBackground>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '120px 24px 80px',
            textAlign: 'center',
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px',
              borderRadius: 999,
              border: `1px solid ${badgeBorder}`,
              background: badgeBg,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              marginBottom: 32,
              animation: 'hero-fade-up 0.5s ease both',
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: badgeDot, display: 'inline-block' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: badgeText, letterSpacing: 0.3, fontFamily: 'var(--font-mono)' }}>
              {t('badge')}
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontSize: 'clamp(48px, 8vw, 96px)',
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: headlineColor,
              maxWidth: 900,
              margin: '0 0 24px',
              fontFamily: 'var(--font-display)',
              whiteSpace: 'pre-line',
              animation: 'hero-fade-up 0.5s 0.1s ease both',
              transition: 'color 0.35s',
            }}
          >
            {t('title')}
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 'clamp(16px, 2.2vw, 20px)',
              lineHeight: 1.65,
              color: subtitleColor,
              maxWidth: 640,
              margin: '0 0 56px',
              animation: 'hero-fade-up 0.5s 0.2s ease both',
              transition: 'color 0.35s',
            }}
          >
            {t('subtitle')}
          </p>

          {/* Scroll indicator */}
          <button
            onClick={scrollToGallery}
            aria-label="Scroll to gallery"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              color: scrollColor,
              animation: 'hero-fade-in 1s 0.6s ease both',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.55'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: 2, textTransform: 'uppercase' }}>
              {t('scrollDown')}
            </span>
            <div style={{ width: 22, height: 36, borderRadius: 11, border: `1.5px solid ${scrollColor}`, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  width: 4, height: 8, borderRadius: 2,
                  background: scrollDot,
                  position: 'absolute', left: '50%', top: 6,
                  transform: 'translateX(-50%)',
                  animation: 'hero-scroll-dot 1.8s ease-in-out infinite',
                }}
              />
            </div>
          </button>
        </div>

        <style>{`
          @keyframes hero-fade-up {
            from { opacity: 0; transform: translateY(18px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes hero-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes hero-scroll-dot {
            0%,100% { top: 6px; opacity: 1; }
            50%      { top: 18px; opacity: 0.28; }
          }
        `}</style>
      </ShaderBackground>

      {/* ── Grid gallery background ──────────────────────────────────────────── */}
      <div
        ref={galleryRef}
        style={{
          position: 'relative',
          backgroundColor: 'var(--bg-canvas)',
          backgroundImage: [
            `linear-gradient(to right, ${gridLineColor} 1px, transparent 1px)`,
            `linear-gradient(to bottom, ${gridLineColor} 1px, transparent 1px)`,
          ].join(', '),
          backgroundSize: '6rem 4rem',
          transition: 'background-color 0.4s',
        }}
      >
        {/* Radial glow 1 — top-right, blue/lavender, synced to hero accent */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: radial1,
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 0.4s',
          }}
        />
        {/* Radial glow 2 — bottom-left, pink accent echo */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            background: radial2,
            pointerEvents: 'none',
            zIndex: 0,
            transition: 'background 0.4s',
          }}
        />
        {/* Top fade — softens the entry from shader */}
        <div
          aria-hidden
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 160,
            background: 'linear-gradient(to bottom, var(--bg-canvas), transparent)',
            pointerEvents: 'none',
            zIndex: 1,
            transition: 'background 0.4s',
          }}
        />
        {/* Bottom fade — blends into footer */}
        <div
          aria-hidden
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 160,
            background: 'linear-gradient(to top, var(--bg-canvas), transparent)',
            pointerEvents: 'none',
            zIndex: 1,
            transition: 'background 0.4s',
          }}
        />

        {/* Scroll-driven 3D gallery */}
        <div style={{ position: 'relative', zIndex: 2 }}>
          {/* h-[220vh] gives enough runway for phase 1 (3D tilt) + phase 2 (horizontal spread) */}
          <ContainerScroll className="h-[220vh]">
            <ContainerSticky className="h-svh">
              <GalleryContainer>
                <GalleryCol yRange={['-10%', '6%']} xRange={['0%', '-28%']} className="-mt-2">
                  {COL_1.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt="HashPass event"
                      className="aspect-video block h-auto w-full rounded-xl object-cover shadow-md"
                      loading="lazy"
                    />
                  ))}
                </GalleryCol>
                <GalleryCol className="mt-[-50%]" yRange={['15%', '6%']} xRange={['0%', '0%']}>
                  {COL_2.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt="HashPass community"
                      className="aspect-video block h-auto w-full rounded-xl object-cover shadow-md"
                      loading="lazy"
                    />
                  ))}
                </GalleryCol>
                <GalleryCol yRange={['-10%', '6%']} xRange={['0%', '28%']} className="-mt-2">
                  {COL_3.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt="HashPass access"
                      className="aspect-video block h-auto w-full rounded-xl object-cover shadow-md"
                      loading="lazy"
                    />
                  ))}
                </GalleryCol>
              </GalleryContainer>
            </ContainerSticky>
          </ContainerScroll>
        </div>
      </div>
    </>
  );
}
