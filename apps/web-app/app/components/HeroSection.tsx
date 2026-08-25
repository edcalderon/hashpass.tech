'use client';

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from '@hashpass/i18n';
import { ShaderBackground } from './ShaderBackground';
import { useLandingAnimationMode } from './LandingAnimationProvider';
import { useTheme } from './ThemeProvider';
import {
  ContainerScroll,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
} from '@/components/blocks/animated-gallery';
import { DownloadShowcase } from '@/components/ui/download-options-section';

// ── HASHPASS event / club / membership photography ───────────────────────────
type GalleryImage = {
  alt: string;
  command: string;
  src: string;
};

const COL_1: GalleryImage[] = [
  { src: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=900&auto=format&fit=crop&q=70', alt: 'Conference audience', command: 'Command your conference.' },
  { src: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=900&auto=format&fit=crop&q=70', alt: 'Live music performer', command: 'Command your concert.' },
  { src: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=900&auto=format&fit=crop&q=70', alt: 'Music festival crowd', command: 'Command your music club.' },
  { src: 'https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=900&auto=format&fit=crop&q=70', alt: 'Fans at a live show', command: 'Command your fan club.' },
];
const COL_2: GalleryImage[] = [
  { src: 'https://images.unsplash.com/photo-1543269865-cbf427effbad?w=900&auto=format&fit=crop&q=70', alt: 'Community planning session', command: 'Command your community.' },
  { src: 'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=900&auto=format&fit=crop&q=70', alt: 'Technology conference presentation', command: 'Command your tech conference.' },
  { src: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=900&auto=format&fit=crop&q=70', alt: 'Friends in a social club', command: 'Command your social club.' },
  { src: 'https://images.unsplash.com/photo-1461897104016-0b3b00cc81ee?w=900&auto=format&fit=crop&q=70', alt: 'Running club race', command: 'Command your running club.' },
];
const COL_3: GalleryImage[] = [
  { src: 'https://images.unsplash.com/photo-1516997121675-4c2d1684aa3e?w=900&auto=format&fit=crop&q=70', alt: 'Private dinner gathering', command: 'Command your members’ club.' },
  { src: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&auto=format&fit=crop&q=70', alt: 'Digital community network', command: 'Command your digital club.' },
  { src: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=900&auto=format&fit=crop&q=70', alt: 'Night club dance floor', command: 'Command your night club.' },
  { src: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=900&auto=format&fit=crop&q=70', alt: 'Private event venue', command: 'Command your private club.' },
];

function GalleryImageCard({ image, onSelect }: { image: GalleryImage; onSelect: (command: string) => void }) {
  return (
    <button
      type="button"
      className="club-gallery-card"
      aria-label={image.command}
      onClick={() => onSelect(image.command)}
    >
      <img
        src={image.src}
        alt={image.alt}
        className="aspect-video block h-auto w-full object-cover shadow-md"
        loading="lazy"
      />
    </button>
  );
}

export function HeroSection() {
  const { t } = useTranslation('hero');
  const { resolvedTheme } = useTheme();
  const { animationMode } = useLandingAnimationMode();
  const galleryRef = useRef<HTMLDivElement>(null);
  const titleEffectRef = useRef<HTMLDivElement>(null);
  const [titlePulse, setTitlePulse] = useState(0);
  const [activeTitleLetter, setActiveTitleLetter] = useState<number | null>(null);
  const [galleryCommand, setGalleryCommand] = useState<{ nonce: number; text: string } | null>(null);
  const isDark = resolvedTheme === 'dark';

  // ── Hero text colors ────────────────────────────────────────────────────────
  const headlineColor = isDark ? '#ffffff'                 : '#0d1728';
  const subtitleColor = isDark ? 'rgba(245,247,251,0.78)' : 'rgba(13,23,40,0.72)';
  const badgeBorder   = isDark ? 'rgba(41,121,255,0.45)'  : 'rgba(155,205,255,0.5)';
  const badgeBg       = isDark ? 'rgba(41,121,255,0.14)'  : '#0b1f3a';
  const badgeDot      = isDark ? '#2979ff'                : '#8ed0ff';
  const badgeText     = isDark ? '#90caf9'                : '#f4f8ff';
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

  const moveTitleLight = (event: PointerEvent<HTMLElement>) => {
    const element = titleEffectRef.current;
    if (!element) return;

    const bounds = element.getBoundingClientRect();
    const pointerX = (event.clientX - bounds.left) / bounds.width;
    const pointerY = (event.clientY - bounds.top) / bounds.height;
    element.style.setProperty('--club-pointer-x', `${pointerX * 100}%`);
    element.style.setProperty('--club-pointer-y', `${pointerY * 100}%`);
    element.style.setProperty('--club-drift-x', `${(pointerX - 0.5) * 34}px`);
  };

  const activateTitleEffect = () => setTitlePulse((value) => value + 1);

  const showGalleryCommand = (text: string) => {
    setGalleryCommand((current) => ({ text, nonce: (current?.nonce ?? 0) + 1 }));
  };

  useEffect(() => {
    if (!galleryCommand) return;
    const timeout = window.setTimeout(() => setGalleryCommand(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [galleryCommand?.nonce]);

  const moveTitleLetter = (event: PointerEvent<HTMLSpanElement>, index: number) => {
    moveTitleLight(event);
    setActiveTitleLetter(index);

    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--club-letter-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
    event.currentTarget.style.setProperty('--club-letter-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
  };

  const clearTitleLetter = (event: PointerEvent<HTMLSpanElement>, index: number) => {
    event.currentTarget.style.removeProperty('--club-letter-x');
    event.currentTarget.style.removeProperty('--club-letter-y');
    setActiveTitleLetter((activeIndex) => activeIndex === index ? null : activeIndex);
  };

  const titleEffectStyle = {
    '--club-title-base': headlineColor,
    '--club-liquid-deep': isDark ? '#b9ccff' : '#102a56',
    '--club-liquid-bright': isDark ? '#e4b8ff' : '#2979d8',
    '--club-liquid-warm': isDark ? '#ffb4d0' : '#a02e86',
    '--club-letter-flare': isDark ? '#ffffff' : '#77baff',
    '--club-letter-deep': isDark ? '#b9ccff' : '#102a56',
    '--club-letter-bright': isDark ? '#e4b8ff' : '#245db0',
    '--club-letter-stroke': isDark ? 'rgba(255,255,255,.48)' : 'rgba(8,27,58,.55)',
    '--club-letter-shadow': isDark ? 'rgba(255,255,255,.68)' : 'rgba(10,33,72,.42)',
    '--club-letter-blend': isDark ? 'screen' : 'normal',
  } as CSSProperties;
  const titleCharacters = t('title').split('');

  return (
    <>
      {/* ── Shader hero ─────────────────────────────────────────────────────── */}
      <ShaderBackground animationMode={animationMode}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '120px 24px 80px',
            textAlign: 'center',
            position: 'relative',
            zIndex: 3,
            isolation: 'isolate',
            width: '100%',
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

          {/* Headline — the colour field and particles are decorative; the h1
              remains ordinary selectable text for screen readers and search. */}
          <div
            ref={titleEffectRef}
            className="club-hero-title-orbit"
            data-pulse={titlePulse}
            style={titleEffectStyle}
            onPointerMove={moveTitleLight}
            onPointerEnter={moveTitleLight}
            onClick={activateTitleEffect}
          >
            <span className="club-hero-title-glass" aria-hidden />
            <span className="club-hero-title-dust" aria-hidden>
              {Array.from({ length: 13 }, (_, index) => (
                <i key={`${titlePulse}-${index}`} />
              ))}
            </span>
            <h1 className="club-hero-title" aria-label={t('title')}>
              {titleCharacters.map((character, index) => {
                if (character === '\n') return <br key={`break-${index}`} />;
                if (character === ' ') return <span className="club-hero-title-space" key={`space-${index}`}>&nbsp;</span>;

                return (
                  <span
                    className="club-hero-title-letter"
                    key={`${character}-${index}`}
                    data-active={activeTitleLetter === index || undefined}
                    onPointerEnter={(event) => moveTitleLetter(event, index)}
                    onPointerMove={(event) => moveTitleLetter(event, index)}
                    onPointerDown={(event) => moveTitleLetter(event, index)}
                    onPointerLeave={(event) => clearTitleLetter(event, index)}
                  >
                    {character}
                  </span>
                );
              })}
            </h1>
          </div>

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
          .club-hero-title-orbit {
            --club-pointer-x: 50%;
            --club-pointer-y: 50%;
            --club-drift-x: 0px;
            position: relative;
            display: inline-grid;
            max-width: min(860px, 100%);
            margin: 0 0 24px;
            isolation: isolate;
            cursor: crosshair;
            animation: hero-fade-up 0.5s 0.1s ease both;
          }
          .club-hero-title {
            position: relative;
            z-index: 2;
            margin: 0;
            font-family: var(--font-display);
            font-size: clamp(44px, 7.5vw, 88px);
            font-weight: 700;
            line-height: 1.05;
            letter-spacing: -1.7px;
            color: var(--club-title-base);
            text-shadow: 0 0 0.01px var(--club-title-base);
            transition: filter 280ms ease, letter-spacing 360ms ease;
          }
          .club-hero-title-orbit:hover .club-hero-title {
            filter: drop-shadow(0 10px 22px color-mix(in srgb, var(--club-liquid-bright) 24%, transparent));
            letter-spacing: -1.15px;
          }
          .club-hero-title-letter {
            --club-letter-x: 50%;
            --club-letter-y: 50%;
            position: relative;
            display: inline-block;
            color: var(--club-title-base);
            transform: translateZ(0);
            transition: color 180ms ease, filter 240ms ease, transform 360ms cubic-bezier(.16,.9,.3,1);
            will-change: background-position, filter, transform;
          }
          .club-hero-title-space { display: inline-block; }
          .club-hero-title-letter[data-active=\"true\"] {
            color: transparent;
            background-image:
              radial-gradient(circle 115% at var(--club-letter-x) var(--club-letter-y), var(--club-letter-flare) 0%, var(--club-letter-bright) 35%, var(--club-letter-deep) 84%),
              linear-gradient(138deg, var(--club-letter-bright), var(--club-letter-deep) 68%, var(--club-liquid-warm));
            background-size: 230% 230%, 180% 180%;
            background-position: var(--club-letter-x) var(--club-letter-y), 50% 50%;
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            -webkit-text-stroke: .45px var(--club-letter-stroke);
            mix-blend-mode: var(--club-letter-blend);
            filter: brightness(1.08) drop-shadow(0 0 11px var(--club-letter-shadow));
            transform: translateY(-0.045em) scale(1.045);
            animation: club-letter-liquid 1.15s cubic-bezier(.22,1,.36,1) both;
          }
          .club-hero-title-glass {
            position: absolute;
            z-index: 1;
            inset: -18% -7%;
            pointer-events: none;
            opacity: 0;
            background:
              radial-gradient(circle 24% at var(--club-pointer-x) var(--club-pointer-y), color-mix(in srgb, var(--club-liquid-bright) 34%, transparent), transparent 72%),
              radial-gradient(circle 17% at calc(var(--club-pointer-x) + 11%) calc(var(--club-pointer-y) - 15%), color-mix(in srgb, var(--club-liquid-warm) 24%, transparent), transparent 74%);
            filter: blur(14px);
            mix-blend-mode: screen;
            transition: opacity 260ms ease;
          }
          .club-hero-title-orbit:hover .club-hero-title-glass { opacity: 1; }
          .club-hero-title-dust { position: absolute; inset: -12%; z-index: 3; pointer-events: none; }
          .club-hero-title-dust i {
            position: absolute;
            width: 5px;
            aspect-ratio: 1;
            border-radius: 999px;
            opacity: 0;
            background: color-mix(in srgb, var(--club-liquid-bright) 78%, white);
            box-shadow: 0 0 12px color-mix(in srgb, var(--club-liquid-warm) 56%, transparent);
          }
          .club-hero-title-dust i:nth-child(1) { left: 8%; top: 62%; }
          .club-hero-title-dust i:nth-child(2) { left: 17%; top: 26%; width: 3px; }
          .club-hero-title-dust i:nth-child(3) { left: 29%; top: 77%; width: 7px; }
          .club-hero-title-dust i:nth-child(4) { left: 37%; top: 19%; width: 4px; }
          .club-hero-title-dust i:nth-child(5) { left: 46%; top: 57%; width: 3px; }
          .club-hero-title-dust i:nth-child(6) { left: 54%; top: 18%; width: 6px; }
          .club-hero-title-dust i:nth-child(7) { left: 61%; top: 78%; width: 4px; }
          .club-hero-title-dust i:nth-child(8) { left: 69%; top: 36%; width: 7px; }
          .club-hero-title-dust i:nth-child(9) { left: 77%; top: 67%; width: 3px; }
          .club-hero-title-dust i:nth-child(10) { left: 85%; top: 22%; width: 5px; }
          .club-hero-title-dust i:nth-child(11) { left: 92%; top: 58%; width: 3px; }
          .club-hero-title-dust i:nth-child(12) { left: 72%; top: 9%; width: 4px; }
          .club-hero-title-dust i:nth-child(13) { left: 23%; top: 95%; width: 3px; }
          .club-hero-title-orbit:hover .club-hero-title-dust i,
          .club-hero-title-orbit[data-pulse]:active .club-hero-title-dust i {
            animation: club-title-dust 1.8s cubic-bezier(.16,.8,.28,1) both;
          }
          .club-hero-title-orbit[data-pulse]:not([data-pulse="0"]) .club-hero-title-dust i {
            animation: club-title-dust 1.25s cubic-bezier(.1,.9,.26,1) both;
          }
          .club-gallery-card {
            position: relative;
            display: block;
            width: 100%;
            padding: 0;
            overflow: hidden;
            cursor: pointer;
            border: 0;
            border-radius: 12px;
            background: transparent;
            isolation: isolate;
            transform: translateZ(0);
          }
          .club-gallery-card::after {
            position: absolute;
            inset: 0;
            z-index: 1;
            content: '';
            border: 2px solid transparent;
            border-radius: inherit;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,.12), 0 0 0 rgba(72,156,255,0);
            transition: border-color 180ms ease, box-shadow 220ms ease, background 220ms ease;
            pointer-events: none;
          }
          .club-gallery-card:hover::after,
          .club-gallery-card:focus-visible::after {
            border-color: rgba(142,204,255,.96);
            background: linear-gradient(135deg, rgba(88,171,255,.18), transparent 45%, rgba(242,112,204,.18));
            box-shadow: inset 0 0 0 1px rgba(255,255,255,.56), 0 0 25px rgba(61,151,255,.55), 0 0 48px rgba(237,69,182,.22);
          }
          .club-gallery-card:focus-visible { outline: 0; }
          .club-gallery-card img {
            transition: filter 220ms ease, transform 350ms cubic-bezier(.16,.9,.3,1);
          }
          .club-gallery-card:hover img,
          .club-gallery-card:focus-visible img {
            filter: saturate(1.12) brightness(1.08);
            transform: scale(1.035);
          }
          @media (min-aspect-ratio: 5 / 4) {
            .club-gallery-fit {
              width: 48%;
              margin-inline: auto;
            }
          }
          .club-gallery-command {
            position: absolute;
            inset: 0;
            z-index: 5;
            display: grid;
            place-content: center;
            padding: 32px;
            text-align: center;
            pointer-events: none;
            background: radial-gradient(ellipse at center, rgba(7,18,45,.8), rgba(4,10,25,.16) 54%, transparent 76%);
            animation: club-gallery-command-veil 320ms ease both;
          }
          .club-gallery-command span {
            margin-bottom: 10px;
            color: #9fceff;
            font-family: var(--font-mono);
            font-size: clamp(10px, 1vw, 13px);
            font-weight: 700;
            letter-spacing: .2em;
            text-transform: uppercase;
            animation: club-gallery-command-up 440ms 60ms cubic-bezier(.16,.9,.3,1) both;
          }
          .club-gallery-command strong {
            max-width: 10ch;
            color: #fff;
            font-family: var(--font-display);
            font-size: clamp(38px, 7vw, 98px);
            font-weight: 700;
            line-height: .95;
            letter-spacing: -0.06em;
            text-wrap: balance;
            text-shadow: 0 0 18px rgba(162,211,255,.9), 0 12px 35px rgba(28,99,255,.55);
            animation: club-gallery-command-up 600ms 100ms cubic-bezier(.16,.9,.3,1) both;
          }
          @keyframes club-gallery-command-veil {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes club-gallery-command-up {
            from { opacity: 0; transform: translateY(20px) scale(.96); filter: blur(9px); }
            to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
          }
          @keyframes club-letter-liquid {
            0% { background-size: 105% 105%, 100% 100%; filter: brightness(1.3) drop-shadow(0 0 3px rgba(255,255,255,.28)); }
            54% { background-size: 268% 268%, 186% 186%; filter: brightness(1.06) drop-shadow(0 0 14px rgba(255,255,255,.54)); }
            100% { background-size: 230% 230%, 180% 180%; }
          }
          @keyframes club-title-dust {
            0% { transform: translate3d(0, 0, 0) scale(.3); opacity: 0; }
            18% { opacity: .9; }
            100% { transform: translate3d(var(--club-drift-x), -34px, 0) scale(1.8); opacity: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .club-hero-title-orbit { cursor: default; }
            .club-hero-title-orbit:hover .club-hero-title,
            .club-hero-title-letter[data-active=\"true\"],
            .club-hero-title-orbit:hover .club-hero-title-dust i,
            .club-hero-title-orbit[data-pulse]:not([data-pulse="0"]) .club-hero-title-dust i,
            .club-gallery-command,
            .club-gallery-command span,
            .club-gallery-command strong { animation: none; }
            .club-hero-title-glass, .club-hero-title-orbit:hover .club-hero-title-glass { opacity: 0; }
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

        {/* A compact motion runway hands directly from the complete collage to
            the download call to action, without empty scroll space. */}
        <ContainerScroll className="h-[120vh]">
            <ContainerSticky className="relative h-svh">
              <GalleryContainer className="club-gallery-fit">
                <GalleryCol yRange={['-10%', '6%']} xRange={['0%', '-28%']} className="-mt-2">
                  {COL_1.map((image) => (
                    <GalleryImageCard key={image.src} image={image} onSelect={showGalleryCommand} />
                  ))}
                </GalleryCol>
                <GalleryCol className="mt-[-50%]" yRange={['15%', '6%']} xRange={['0%', '0%']}>
                  {COL_2.map((image) => (
                    <GalleryImageCard key={image.src} image={image} onSelect={showGalleryCommand} />
                  ))}
                </GalleryCol>
                <GalleryCol yRange={['-10%', '6%']} xRange={['0%', '28%']} className="-mt-2">
                  {COL_3.map((image) => (
                    <GalleryImageCard key={image.src} image={image} onSelect={showGalleryCommand} />
                  ))}
                </GalleryCol>
              </GalleryContainer>
              {galleryCommand && (
                <div key={galleryCommand.nonce} className="club-gallery-command" role="status" aria-live="polite">
                  <span>HASHPASS CLUB</span>
                  <strong>{galleryCommand.text}</strong>
                </div>
              )}
            </ContainerSticky>
        </ContainerScroll>

        {/* The gallery has finished its scroll animation before the app install CTA appears. */}
        <DownloadShowcase />
      </div>
    </>
  );
}
