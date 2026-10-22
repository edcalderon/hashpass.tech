import type { ColorMode } from '@hashpass/ui/tokens';
import type { PinProblem, UsePin } from '../../../types/pin.types';
import type { StepUpScope } from '../../../types/step-up.types';

/** The i18n `t` helper's signature, so plain-language mapping stays unit-testable. */
export type Translate = (key: string, fallback: string, params?: Record<string, unknown>) => string;

export interface PinFlowProps {
  mode: ColorMode;
  pin: UsePin;
  /** What the proof is for: it only works for this action. */
  scope: StepUpScope;
  /** `create` asks twice; `unlock` asks once. The flow switches by itself if the server disagrees. */
  intent: 'create' | 'unlock';
  onDone: () => void;
  onCancel?: () => void;
}
