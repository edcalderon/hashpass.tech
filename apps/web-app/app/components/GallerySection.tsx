'use client';

import {
  ContainerScroll,
  ContainerSticky,
  GalleryCol,
  GalleryContainer,
} from '@/components/blocks/animated-gallery';
import { useTheme } from './ThemeProvider';

// ── HashPass-relevant event / club / membership photography ──────────────────
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

/**
 * Scroll-driven 3D photo gallery that begins right at the bottom of the hero.
 * No heading — the hero text is the introduction; this is the visual payoff.
 */
export function GallerySection() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const glowGradient = isDark
    ? 'linear-gradient(to right, #0a0a1a, #1565c0, #e91e8c)'
    : 'linear-gradient(to right, #e8f0fe, #1976d2, #e91e8c)';

  return (
    <div
      style={{
        position: 'relative',
        // Pull the section up so it starts flush under the hero fade
        marginTop: -100,
        background: 'var(--bg-canvas)',
      }}
    >
      {/* Ambient glow — same palette as hero shader */}
      <div
        aria-hidden
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '60vh',
          background: glowGradient,
          filter: 'blur(100px)',
          opacity: isDark ? 0.14 : 0.10,
          mixBlendMode: 'screen',
          zIndex: 0,
          transition: 'opacity 0.4s, background 0.4s',
        }}
      />

      {/* Scroll-driven 3-D gallery */}
      <ContainerScroll className="relative z-10 h-[350vh]">
        <ContainerSticky className="h-svh">
          <GalleryContainer>
            <GalleryCol yRange={['-10%', '2%']} className="-mt-2">
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

            <GalleryCol className="mt-[-50%]" yRange={['15%', '5%']}>
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

            <GalleryCol yRange={['-10%', '2%']} className="-mt-2">
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
  );
}
