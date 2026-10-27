import type { GateView, SmaArchiveState } from './types.ts';

/**
 * Decides what the page shows. Closing the first-setup dialog is a normal choice, not an error: the visitor
 * gets the public landing page, and the dashboard (which needs a local Companion) only appears once one exists.
 */
export function resolveGate(status: SmaArchiveState['status'], hasArchive: boolean, setupDismissed: boolean): GateView {
  if (status === 'loading') return 'loading';
  if (status === 'ready' && hasArchive) return 'workspace';
  return setupDismissed ? 'landing' : 'setup';
}
