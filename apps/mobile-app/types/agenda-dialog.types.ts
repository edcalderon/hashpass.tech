import type { ReactNode } from 'react';

export type AgendaDialogTone = 'success' | 'accent' | 'danger';

export interface AgendaDialogProps {
  visible: boolean;
  /** Hue of the icon medallion; the only coloured element besides the primary action. */
  tone: AgendaDialogTone;
  /** Material icon name shown in the medallion. */
  icon: string;
  title: string;
  subtitle?: string;
  /** Body content between the header and the actions. */
  children?: ReactNode;
  /** Action row, usually a secondary and a primary `ActionButton`. */
  actions: ReactNode;
  onClose: () => void;
  /** Hides the corner close button, e.g. while a request is in flight. */
  closeDisabled?: boolean;
  testID?: string;
}
