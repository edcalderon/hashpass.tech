import type { ColorMode } from '@hashpass/ui/tokens';

/** What a hardware key (web) maps to on the keypad. */
export type PinKeyAction = { type: 'digit'; digit: string } | { type: 'delete' } | null;

export interface PinPadProps {
  mode: ColorMode;
  title: string;
  hint?: string;
  /** Already-translated problem to show under the dots. */
  error?: string | null;
  busy?: boolean;
  /** Blocks input without implying work in progress, e.g. during a lockout. */
  disabled?: boolean;
  /** Called with the four digits; the pad forgets them in the same tick. */
  onComplete: (pin: string) => void;
}
