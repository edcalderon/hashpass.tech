'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from './ThemeProvider';

const MeshGradient = dynamic(
  () => import('@paper-design/shaders-react').then((m) => m.MeshGradient),
  { ssr: false }
);

const DARK_PRIMARY   = ['#000000', '#1565c0', '#e91e8c', '#000d1a', '#1a237e'] as const;
const DARK_OVERLAY   = ['#000000', '#2979ff', '#ff4081', '#0a0a2e']            as const;

const LIGHT_PRIMARY  = ['#e8f0fe', '#1976d2', '#e91e8c', '#f3e5f5', '#5c6bc0'] as const;
const LIGHT_OVERLAY  = ['#ffffff', '#64b5f6', '#f48fb1', '#ede7f6']             as const;

interface ShaderBackgroundProps {
  children: ReactNode;
}

export function ShaderBackground({ children }: ShaderBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  const isDark = resolvedTheme === 'dark';
  const primary = isDark ? DARK_PRIMARY : LIGHT_PRIMARY;
  const overlay = isDark ? DARK_OVERLAY : LIGHT_OVERLAY;
  const canvasBg = isDark ? '#000000' : '#ffffff';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: canvasBg,
        transition: 'background 0.4s',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {mounted && (
        <>
          {/* Primary layer — position:sticky so it stays in viewport as gallery scrolls */}
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
              speed={isHovered ? 0.6 : 0.28}
              distortion={0.32}
              swirl={0.22}
            />
            <MeshGradient
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                opacity: isDark ? 0.5 : 0.35,
                mixBlendMode: isDark ? 'screen' : 'multiply',
              }}
              colors={[...overlay]}
              speed={0.16}
              distortion={0.45}
            />
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
