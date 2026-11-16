import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ContactMessagingContext as Context } from '../contexts/ContactMessagingContext';
import { AppState } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../lib/api-client';
import { messagingData } from '../lib/contact-messaging';
import type { MessagingSnapshot } from '../types/contact-messaging';
export function ContactMessagingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const account = !isLoading && user?.id ? user.id : null;
  return <AccountMessages account={account}>{children}</AccountMessages>;
}
function AccountMessages({ account, children }: { account: string | null; children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MessagingSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshVersion, setVersion] = useState(0);
  const mounted = useRef(true);
  const generation = useRef(0);
  const owner = useRef(account);
  if (owner.current !== account) {
    owner.current = account;
    generation.current += 1;
    setSnapshot(null); setError(null); setLoading(false); setVersion(0);
  }
  const reload = useCallback(async () => {
    if (!account) return;
    const run = ++generation.current;
    setLoading(true);
    try {
      const data = messagingData<MessagingSnapshot>(await apiClient.get('contact-messages', { skipEventSegment: true, retries: 0 }));
      if (!mounted.current || run !== generation.current) return;
      setSnapshot(data); setError(null);
    } catch {
      if (mounted.current && run === generation.current) setError('Messages are temporarily unavailable. Please try again.');
    } finally { if (mounted.current && run === generation.current) setLoading(false); }
  }, [account]);
  useEffect(() => {
    mounted.current = true;
    if (!account) return () => { mounted.current = false; generation.current += 1; };
    const poll = () => { if (AppState.currentState === 'active' || AppState.currentState == null) { void reload(); setVersion(value => value + 1); } };
    void reload();
    const timer = setInterval(poll, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') poll(); });
    return () => { mounted.current = false; generation.current += 1; clearInterval(timer); subscription.remove(); };
  }, [account, reload]);
  const changed = useCallback(() => { setVersion(value => value + 1); void reload(); }, [reload]);
  return <Context.Provider value={{ snapshot, error, loading, reload, refreshVersion, changed, account }}>{children}</Context.Provider>;
}
