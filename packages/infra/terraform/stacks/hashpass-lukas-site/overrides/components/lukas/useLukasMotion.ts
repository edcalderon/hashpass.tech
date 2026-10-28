import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

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
