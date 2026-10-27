import type { LocalSmaArchive } from '../sma/types';
import type { CompanionAuthState } from '../auth/types';

export type CompanionControlStatus = 'active' | 'draft';
export type CompanionControlRole = 'manager' | 'coder' | 'assistant';

export type CompanionSummary = {
  id: string;
  name: string;
  role: CompanionControlRole;
  status: CompanionControlStatus;
  controller: 'owner' | 'delegated';
  sma: 'connected' | 'pending';
  scope: 'local-sma' | 'workspace-tool-grants';
};

export type ControlPlaneModel = {
  workspaceName: 'hashpass';
  projectName: 'companion-platform';
  companions: CompanionSummary[];
  plan: {
    name: 'free' | 'premium';
    included: number;
    used: number;
    source: 'proposed-local-preview';
  };
};

export type CompanionControlPanelProps = {
  archive: LocalSmaArchive;
  onExport: () => string;
  auth: CompanionAuthState;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRetryAuth: () => Promise<void>;
};

export type CompanionCardProps = {
  companion: CompanionSummary;
};
