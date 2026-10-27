import { assertArchive } from './runtime';
import type { LocalSmaArchive } from './types';

const STORAGE_KEY = 'hashpass.companion.sma.local.v1';

export async function loadLocalArchive(): Promise<LocalSmaArchive | null> {
  if (typeof window === 'undefined') return null;
  const serialized = window.localStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;
  const archive = JSON.parse(serialized) as LocalSmaArchive;
  await assertArchive(archive);
  return archive;
}

export function saveLocalArchive(archive: LocalSmaArchive): void {
  if (typeof window === 'undefined') throw new Error('Local SMA storage is only available in the browser.');
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
}

export function clearLocalArchive(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
