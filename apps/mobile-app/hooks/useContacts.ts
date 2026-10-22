import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/api-client';
import type { ContactsAction, ContactsApiResult, ContactsSnapshot } from '../types/contacts';

/**
 * The contacts route replies `{ data: snapshot }` and apiClient wraps every body
 * as `{ data: body, success }`, so the snapshot arrives one level deeper than
 * the typed contract. Accept both shapes and refuse anything that is not a
 * complete snapshot instead of letting the screen crash on a missing list.
 */
export function readContactsSnapshot(payload: unknown): ContactsSnapshot | null {
  const nested = (payload as { data?: unknown } | null)?.data;
  const candidate = (nested && typeof nested === 'object' && !('incoming' in (payload as object)) ? nested : payload) as Partial<ContactsSnapshot> | null;
  if (!candidate || typeof candidate !== 'object') return null;
  const lists = ['contacts', 'incoming', 'outgoing', 'suggestions', 'leaderboard'] as const;
  if (!lists.every(key => Array.isArray(candidate[key]))) return null;
  return candidate as ContactsSnapshot;
}

export function useContacts(userId: string | null, card?: string) {
  const [snapshot, setSnapshot] = useState<ContactsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const mutation = useRef(false);
  const ownerKey = `${userId ?? ''}:${card ?? ''}`;
  const owner = useRef(ownerKey);
  // Clear render-visible state immediately when accounts change; outstanding
  // requests cannot publish another account's data after effect cleanup.
  if (owner.current !== ownerKey) {
    owner.current = ownerKey;
    generation.current += 1;
    setSnapshot(null);
    setError(null);
    setBusy(false);
    mutation.current = false;
  }

  const reload = useCallback(async () => {
    if (mutation.current) return;
    const run = ++generation.current;
    if (!userId) { setSnapshot(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('contacts', {
        skipEventSegment: true, retries: 0, params: card ? { card } : undefined,
      }) as ContactsApiResult;
      if (generation.current !== run) return;
      const next = response.success ? readContactsSnapshot(response.data) : null;
      if (next) setSnapshot(next);
      else setError(response.success ? 'Contacts unavailable' : response.error);
    } catch {
      if (generation.current === run) setError('Contacts unavailable');
    } finally {
      if (generation.current === run) setLoading(false);
    }
  }, [userId, card]);

  useEffect(() => { void reload(); return () => { generation.current += 1; }; }, [reload]);

  const act = useCallback(async (action: ContactsAction) => {
    if (!userId || mutation.current) return false;
    const run = ++generation.current;
    mutation.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await apiClient.post('contacts', action, { skipEventSegment: true, retries: 0, params: card ? { card } : undefined }) as ContactsApiResult;
      if (generation.current !== run) return false;
      if (!response.success) { setError(response.error); return false; }
      const next = readContactsSnapshot(response.data);
      if (!next) { setError('Contacts unavailable'); return false; }
      setSnapshot(next);
      return true;
    } catch {
      if (generation.current === run) setError('Contacts unavailable');
      return false;
    } finally {
      if (generation.current === run) { mutation.current = false; setBusy(false); setLoading(false); }
    }
  }, [userId, card]);

  return { snapshot, loading, busy, error, reload, act };
}
