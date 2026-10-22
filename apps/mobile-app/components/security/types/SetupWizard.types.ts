import type { ColorMode } from '@hashpass/ui/tokens';
import type { UsePin } from '../../../types/pin.types';
import type { SetupWizardContext, SetupWizardEvent, SetupWizardView } from '../../../types/setup-wizard.types';

export interface SetupWizardProps {
  mode: ColorMode;
  view: SetupWizardView;
  context: SetupWizardContext;
  send: (event: SetupWizardEvent) => void;
  pin: UsePin;
  /** Lets someone who is only revisiting settings leave without finishing. */
  onClose?: () => void;
}
