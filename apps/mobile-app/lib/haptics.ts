import * as Haptics from 'expo-haptics';

/**
 * Fire-and-forget haptic taps for primary button presses.
 *
 * Safe on every platform: expo-haptics is a no-op on web, and any native
 * rejection (e.g. a device without a vibration motor, or haptics disabled in
 * system settings) is swallowed so a button press never surfaces an unhandled
 * promise rejection. Callers do not need to await these.
 */
export const hapticLight = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export const hapticMedium = (): void => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};
