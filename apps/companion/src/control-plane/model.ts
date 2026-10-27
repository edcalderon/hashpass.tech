import type { LocalSmaArchive } from '../sma/types';
import type { CompanionSummary, ControlPlaneModel } from './types';

export function createControlPlaneModel(archive: LocalSmaArchive): ControlPlaneModel {
  const manager: CompanionSummary = {
    id: archive.manifest.agent.did,
    name: archive.manifest.agent.name,
    role: 'manager',
    status: 'active',
    controller: 'owner',
    sma: 'connected',
    scope: 'local-sma',
  };

  return {
    workspaceName: 'hashpass',
    projectName: 'companion-platform',
    companions: [manager],
    plan: {
      name: 'free',
      included: 2,
      used: 1,
      source: 'proposed-local-preview',
    },
  };
}

export function createDraftCompanion(name: string, index: number): CompanionSummary {
  return {
    id: `draft:companion-${index}`,
    name,
    role: 'coder',
    status: 'draft',
    controller: 'delegated',
    sma: 'pending',
    scope: 'workspace-tool-grants',
  };
}
