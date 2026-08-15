'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from './ThemeProvider';
import type { LandingAnimationMode } from './LandingAnimationProvider';

const MeshGradient = dynamic(
  () => import('@paper-design/shaders-react').then((m) => m.MeshGradient),
  { ssr: false }
);

const DARK_PRIMARY   = ['#000000', '#1565c0', '#e91e8c', '#000d1a', '#1a237e'] as const;
const DARK_OVERLAY   = ['#000000', '#2979ff', '#ff4081', '#0a0a2e']            as const;

const LIGHT_PRIMARY  = ['#e8f0fe', '#1976d2', '#e91e8c', '#f3e5f5', '#5c6bc0'] as const;
const LIGHT_OVERLAY  = ['#ffffff', '#64b5f6', '#f48fb1', '#ede7f6']             as const;

interface ShaderBackgroundProps {
  animationMode: LandingAnimationMode;
  children: ReactNode;
}

const FULL_SHADER_PIXELS = 1920 * 1080 * 2;
const LOW_SHADER_PIXELS = 1280 * 720;

export function ShaderBackground({ animationMode, children }: ShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isHeroVisible, setIsHeroVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);
    updatePreference();
    mediaQuery.addEventListener('change', updatePreference);
    return () => mediaQuery.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || animationMode === 'static') return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsHeroVisible(entry.isIntersecting),
      { rootMargin: '160px 0px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [animationMode]);

  const isDark = resolvedTheme === 'dark';
  const primary = isDark ? DARK_PRIMARY : LIGHT_PRIMARY;
  const overlay = isDark ? DARK_OVERLAY : LIGHT_OVERLAY;
  const canvasBg = isDark ? '#000000' : '#ffffff';
  const useStaticBackground = animationMode === 'static' || prefersReducedMotion;
  const useFullAnimation = animationMode === 'full' && !useStaticBackground;
  const useLowAnimation = animationMode === 'low' && !useStaticBackground;
  // Speed zero tells Paper Shaders to cancel its requestAnimationFrame loop.
  const activeSpeed = isHeroVisible ? (isHovered ? 0.2 : 0.1) : 0;
  const staticBackground = isDark
    ? 'radial-gradient(circle 70% at 82% 14%, rgba(41,121,255,.34), transparent 56%), radial-gradient(circle 56% at 10% 88%, rgba(233,30,140,.2), transparent 62%), linear-gradient(140deg, #000000 0%, #000d1a 52%, #1a237e 100%)'
    : 'radial-gradient(circle 72% at 82% 14%, rgba(92,107,192,.44), transparent 56%), radial-gradient(circle 56% at 10% 88%, rgba(233,30,140,.14), transparent 62%), linear-gradient(140deg, #e8f0fe 0%, #f3e5f5 52%, #ffffff 100%)';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: canvasBg,
        transition: 'background 0.4s',
      }}
      onMouseEnter={useStaticBackground ? undefined : () => setIsHovered(true)}
      onMouseLeave={useStaticBackground ? undefined : () => setIsHovered(false)}
    >
      {useStaticBackground ? (
        <div
          aria-hidden
          style={{
            position: 'sticky', top: 0, height: '100vh', marginBottom: '-100vh',
            background: staticBackground, pointerEvents: 'none', zIndex: 0,
          }}
        />
      ) : mounted && (
        <>
          {/* The shader pauses completely once this hero leaves the viewport. */}
          <div
            aria-hidden
            style={{
              position: 'sticky',
              top: 0,
              height: '100vh',
              marginBottom: '-100vh',
              zIndex: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            <MeshGradient
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              colors={[...primary]}
              speed={useFullAnimation ? (isHeroVisible ? (isHovered ? 0.6 : 0.28) : 0) : activeSpeed}
              distortion={0.32}
              swirl={0.22}
              minPixelRatio={useFullAnimation ? 1.5 : 1}
              maxPixelCount={useFullAnimation ? FULL_SHADER_PIXELS : LOW_SHADER_PIXELS}
              webGlContextAttributes={{ powerPreference: useLowAnimation ? 'low-power' : 'high-performance' }}
            />
            {useFullAnimation && (
              <MeshGradient
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%',
                  opacity: isDark ? 0.5 : 0.35, mixBlendMode: isDark ? 'screen' : 'multiply',
                }}
                colors={[...overlay]}
                speed={isHeroVisible ? 0.16 : 0}
                distortion={0.45}
                minPixelRatio={1.5}
                maxPixelCount={FULL_SHADER_PIXELS}
                webGlContextAttributes={{ powerPreference: 'high-performance' }}
              />
            )}
          </div>
        </>
      )}

      {/* Content scrolls over the sticky shader */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>

      {/* Bottom fade — blends into the grid gallery section */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          background: 'linear-gradient(to bottom, transparent, var(--bg-canvas))',
          pointerEvents: 'none',
          zIndex: 2,
          transition: 'background 0.4s',
        }}
      />
    </div>
  );
}
