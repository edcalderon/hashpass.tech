import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../lib/api-client';
import type { ContactsAction, ContactsApiResult, ContactsSnapshot } from '../types/contacts';

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
      if (response.success) setSnapshot(response.data);
      else setError(response.error);
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
      setSnapshot(response.data);
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
