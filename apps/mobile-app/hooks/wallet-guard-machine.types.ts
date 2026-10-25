/**
 * Gate for the wallet view:
 *   checking -> pin_setup (no PIN yet) | pin_entry (PIN exists) | unlocked (live proof) | unavailable
 *   pin_setup -> unlocked (PinFlow creates the PIN and mints the proof)
 *   pin_entry -> unlocked
 *   unlocked -> locked (proof lapsed, explicit lock, app backgrounded) -> unlocked
 *
 * Pure state: it never sees the PIN. The PIN pad reports only UNLOCKED / PIN_SETUP_DONE.
 */
export type WalletGuardPhase = 'checking' | 'pin_setup' | 'pin_entry' | 'unlocked' | 'locked' | 'unavailable';

export type WalletGuardEvent =
  | { type: 'CHECK_DONE'; pinEnabled: boolean; unlocked: boolean }
  | { type: 'CHECK_FAILED' }
  | { type: 'RETRY' }
  | { type: 'PIN_SETUP_DONE' }
  | { type: 'UNLOCKED' }
  | { type: 'LOCKED' }
  | { type: 'APP_BACKGROUND' };
