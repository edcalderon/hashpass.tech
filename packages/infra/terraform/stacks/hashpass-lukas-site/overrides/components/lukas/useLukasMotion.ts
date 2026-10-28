import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { LukasAnimationLevel } from '../../types/lukas.types';

/** Resolved animation level (user setting + system preference) for every decorative scene. */
export const LukasMotionContext = createContext<LukasAnimationLevel>('full');
export const useLukasAnimationLevel = (): LukasAnimationLevel => useContext(LukasMotionContext);

/** Pauses CSS-driven scenes while off-screen or in a background tab (`data-active`). */
export function useSceneActivity(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof document === 'undefined') return undefined;
    let visible = typeof IntersectionObserver === 'undefined';
    const update = () => { element.dataset.active = String(visible && !document.hidden); };
    update();
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); });
    observer?.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, [ref]);
}

/** Start static until the OS preference has resolved to avoid a motion flash. */
export function useSystemReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    let active = true;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      const update = () => {
        if (active) setReducedMotion(preference.matches);
      };
      update();
      preference.addEventListener?.('change', update);
      preference.addListener?.(update);
      return () => {
        active = false;
        preference.removeEventListener?.('change', update);
        preference.removeListener?.(update);
      };
    }

    const nativePreference = AccessibilityInfo.isReduceMotionEnabled?.();
    if (nativePreference && typeof nativePreference.then === 'function') {
      void nativePreference
        .then((enabled) => {
          if (active) setReducedMotion(enabled);
        })
        .catch(() => undefined);
    }
    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReducedMotion);
    return () => {
      active = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
}
