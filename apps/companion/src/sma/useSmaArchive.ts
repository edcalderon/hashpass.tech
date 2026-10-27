import { useCallback, useEffect, useState } from 'react';
import { appendMemory, createLocalArchive, serializeArchive } from './runtime';
import { clearLocalArchive, loadLocalArchive, saveLocalArchive } from './storage';
import type { LocalSmaArchive, SmaArchiveState, SmaMemoryInput } from './types';

export function useSmaArchive() {
  const [state, setState] = useState<SmaArchiveState>({status: 'loading', archive: null, error: null});

  useEffect(() => {
    loadLocalArchive()
      .then((archive) => setState({status: archive ? 'ready' : 'setup', archive, error: null}))
      .catch((error: unknown) => setState({status: 'setup', archive: null, error: error instanceof Error ? error.message : 'Local Companion memory could not be read.'}));
  }, []);

  const setup = useCallback(async (email: string) => {
    try {
      const archive = await createLocalArchive(email);
      saveLocalArchive(archive);
      setState({status: 'ready', archive, error: null});
      return archive.ownerEmail;
    } catch (error: unknown) {
      setState((current) => ({...current, status: 'setup', error: error instanceof Error ? error.message : 'Companion setup failed.'}));
      return null;
    }
  }, []);

  const remember = useCallback(async (input: SmaMemoryInput) => {
    if (!state.archive) return false;
    try {
      const archive = await appendMemory(state.archive, input);
      saveLocalArchive(archive);
      setState({status: 'ready', archive, error: null});
      return true;
    } catch (error: unknown) {
      setState((current) => ({...current, error: error instanceof Error ? error.message : 'Memory could not be saved.'}));
      return false;
    }
  }, [state.archive]);

  const reset = useCallback(() => {
    clearLocalArchive();
    setState({status: 'setup', archive: null, error: null});
  }, []);

  const exportArchive = useCallback(() => state.archive ? serializeArchive(state.archive) : '', [state.archive]);

  return {
    ...state,
    setup,
    remember,
    reset,
    exportArchive,
  } satisfies {
    status: SmaArchiveState['status'];
    archive: LocalSmaArchive | null;
    error: string | null;
    setup: (email: string) => Promise<string | null>;
    remember: (input: SmaMemoryInput) => Promise<boolean>;
    reset: () => void;
    exportArchive: () => string;
  };
}
