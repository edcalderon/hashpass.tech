import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { usePassMotionPreferences } from './pass-motion-preferences';

export interface PassTiltCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accentColor?: string;
  isDark?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export interface PassDepthLayerProps {
  children: React.ReactNode;
  /** How far this layer floats above the card face, in px. */
  depth?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

// Maximum rotation at the very corner of the card, in degrees. Past ~10 the
// text edges start to alias and it reads as a gimmick rather than a physical
// card catching the light.
const MAX_TILT_DEG = 9;
const PERSPECTIVE_PX = 1100;
const REST_TRANSFORM = `perspective(${PERSPECTIVE_PX}px) rotateX(0deg) rotateY(0deg) translateZ(0px)`;

/**
 * Lifts a layer of the card off its face so it parallaxes against the tilt.
 *
 * Only meaningful on web: it relies on the parent's `transform-style:
 * preserve-3d`, which is what makes translateZ resolve in the same 3D
 * context as the card's rotation instead of being flattened.
 */
export const PassDepthLayer: React.FC<PassDepthLayerProps> = ({
  children,
  depth = 0,
  style,
  pointerEvents,
}) => {
  const { supports3d } = usePassMotionPreferences();
  const flattened = StyleSheet.flatten(style) as Record<string, any> | undefined;

  return (
    <div
      style={{
        ...(flattened as React.CSSProperties),
        transform: supports3d ? `translateZ(${depth}px)` : undefined,
        transformStyle: supports3d ? 'preserve-3d' : undefined,
        pointerEvents: pointerEvents === 'none' ? 'none' : undefined,
      }}
    >
      {children}
    </div>
  );
};

/**
 * The web half of the pass card's 3D treatment: the card tilts toward the
 * pointer with a specular sheen that tracks it, so it reads as a physical
 * pass being angled in the light rather than a flat rectangle.
 *
 * Written against the DOM directly rather than through animated state on
 * purpose -- pointer movement fires far faster than React can usefully
 * re-render, so the transform is written inside a single rAF frame and never
 * touches the React tree. Same approach as components/GlowingEffect.web.tsx.
 */
const PassTiltCard: React.FC<PassTiltCardProps> = ({
  children,
  style,
  accentColor = '#FFFFFF',
  isDark = false,
  disabled = false,
  onPress,
}) => {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const sheenRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const { supports3d } = usePassMotionPreferences();

  const reset = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (innerRef.current) {
      innerRef.current.style.transition = 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';
      innerRef.current.style.transform = REST_TRANSFORM;
    }
    if (sheenRef.current) {
      sheenRef.current.style.transition = 'opacity 420ms ease-out';
      sheenRef.current.style.opacity = '0';
    }
  }, []);

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !supports3d) return;
      const outer = outerRef.current;
      if (!outer) return;

      const { left, top, width, height } = outer.getBoundingClientRect();
      if (!width || !height) return;

      // -0.5 .. 0.5, measured from the card's centre.
      const px = (event.clientX - left) / width - 0.5;
      const py = (event.clientY - top) / height - 0.5;

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const inner = innerRef.current;
        if (inner) {
          inner.style.transition = 'transform 90ms linear';
          inner.style.transform =
            `perspective(${PERSPECTIVE_PX}px) ` +
            `rotateX(${(-py * 2 * MAX_TILT_DEG).toFixed(2)}deg) ` +
            `rotateY(${(px * 2 * MAX_TILT_DEG).toFixed(2)}deg) ` +
            'translateZ(12px)';
        }

        const sheen = sheenRef.current;
        if (sheen) {
          sheen.style.transition = 'opacity 160ms ease-out';
          sheen.style.opacity = isDark ? '0.5' : '0.35';
          sheen.style.background =
            `radial-gradient(340px circle at ${((px + 0.5) * 100).toFixed(1)}% ${((py + 0.5) * 100).toFixed(1)}%, ` +
            `${isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'} 0%, ` +
            'rgba(255,255,255,0) 62%)';
        }
      });
    },
    [disabled, isDark, supports3d]
  );

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    []
  );

  const flattened = StyleSheet.flatten(style) as Record<string, any> | undefined;
  const borderRadius = (flattened?.borderRadius as number) ?? 20;

  return (
    <div
      ref={outerRef}
      onPointerMove={supports3d ? handleMove : undefined}
      onPointerLeave={supports3d ? reset : undefined}
      onPointerCancel={supports3d ? reset : undefined}
      onClick={onPress}
      style={{
        ...(flattened as React.CSSProperties),
        perspective: supports3d ? `${PERSPECTIVE_PX}px` : undefined,
        cursor: onPress ? 'pointer' : undefined,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          borderRadius,
          overflow: 'hidden',
        }}
      >
        <div
          ref={innerRef}
          style={{
            position: 'relative',
            width: '100%',
            borderRadius,
            // Keep the preserve-3d context unclipped. The wrapper above is
            // the separate clipping layer for both the fallback and 3D card.
            transformStyle: supports3d ? 'preserve-3d' : undefined,
            transform: supports3d ? REST_TRANSFORM : undefined,
            willChange: supports3d ? 'transform' : undefined,
            boxShadow: isDark
              ? `0 18px 40px -18px ${accentColor}66, 0 8px 24px -12px rgba(0,0,0,0.8)`
              : `0 18px 40px -20px ${accentColor}55, 0 8px 20px -14px rgba(0,0,0,0.35)`,
          }}
        >
          {children}
          {supports3d ? (
            <div
              ref={sheenRef}
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius,
                opacity: 0,
                pointerEvents: 'none',
                mixBlendMode: isDark ? 'soft-light' : 'overlay',
                transform: 'translateZ(1px)',
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default PassTiltCard;
