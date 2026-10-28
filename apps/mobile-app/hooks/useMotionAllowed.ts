import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useAnimations } from '../providers/AnimationProvider';

/**
 * The app-level "disable animations" setting. Some screens (event pages) sit outside the
 * dashboard's AnimationProvider, where the hook throws; animations are then simply on. The
 * context read happens before the throw, so hook order stays stable.
 */
function useAppAnimationsEnabled(): boolean {
  try {
    return useAnimations().animationsEnabled;
  } catch {
    return true;
  }
}

/**
 * True only when both motion preferences allow movement (AGENTS.md): the app-level setting and the
 * system reduced-motion flag, including changes while mounted. Until the system answer arrives
 * (or if it cannot be read) motion stays off, so nothing flashes before the preference is known.
 */
export function useMotionAllowed(initiallyAllowed = false): boolean {
  const animationsEnabled = useAppAnimationsEnabled();
  const [systemReducedMotion, setSystemReducedMotion] = useState(!initiallyAllowed);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(reduced => { if (active) setSystemReducedMotion(reduced); })
      .catch(() => { if (active) setSystemReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReducedMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  return animationsEnabled && !systemReducedMotion;
}
