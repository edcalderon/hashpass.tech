import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface PassMotionPreferences {
  /** Enables CSS 3D only for devices that can actually hover a fine pointer. */
  supports3d: boolean;
  /** System-level reduced motion must always win over decorative motion. */
  reducedMotion: boolean;
}

const NATIVE_PREFERENCES: PassMotionPreferences = {
  supports3d: true,
  reducedMotion: false,
};

const WEB_FALLBACK_PREFERENCES: PassMotionPreferences = {
  // Safe during SSR and until browser capability is known. Essential pass
  // content remains visible in the 2D presentation.
  supports3d: false,
  reducedMotion: true,
};

type MediaQueryReader = (query: string) => MediaQueryList;

/**
 * Some browsers expose the hover media query but flatten nested 3D
 * transforms. Keep the desktop treatment opt-in only when the CSS engine
 * advertises the primitives the card needs; the 2D face crossfade remains the
 * safe presentation everywhere else.
 */
export const hasCss3dSupport = (): boolean => {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    // Older test environments and browsers without CSS.supports do not give
    // us a reliable negative signal. The pointer media query still gates the
    // optional effect in that case.
    return true;
  }

  return (
    CSS.supports('transform-style', 'preserve-3d') &&
    CSS.supports('backface-visibility', 'hidden') &&
    CSS.supports('transform', 'perspective(1px) rotateY(1deg)')
  );
};

export const resolveWebPassMotionPreferences = (
  matchMedia: MediaQueryReader,
  css3dSupported = true,
): PassMotionPreferences => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // WebKit PWA/touch environments frequently flatten nested preserve-3d and
  // backface layers. A hoverable fine pointer is the useful, standards-based
  // signal that the optional desktop tilt can be rendered safely.
  const supports3d =
    css3dSupported && !reducedMotion && matchMedia('(hover: hover) and (pointer: fine)').matches;

  return { supports3d, reducedMotion };
};

const getInitialPreferences = (): PassMotionPreferences => {
  if (Platform.OS !== 'web') return NATIVE_PREFERENCES;
  if (typeof window === 'undefined' || !window.matchMedia) return WEB_FALLBACK_PREFERENCES;
  return resolveWebPassMotionPreferences(window.matchMedia, hasCss3dSupport());
};

const subscribe = (query: MediaQueryList, listener: () => void) => {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }

  const legacyQuery = query as MediaQueryList & {
    addListener?: (listener: () => void) => void;
    removeListener?: (listener: () => void) => void;
  };
  legacyQuery.addListener?.(listener);
  return () => legacyQuery.removeListener?.(listener);
};

export const usePassMotionPreferences = (): PassMotionPreferences => {
  const [preferences, setPreferences] = useState<PassMotionPreferences>(getInitialPreferences);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setPreferences(resolveWebPassMotionPreferences(window.matchMedia, hasCss3dSupport()));

    update();
    const unsubscribeReducedMotion = subscribe(reducedMotionQuery, update);
    const unsubscribePointer = subscribe(pointerQuery, update);

    return () => {
      unsubscribeReducedMotion();
      unsubscribePointer();
    };
  }, []);

  return preferences;
};
