'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseClient } from '../../lib/supabase-client';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  isLoading: true,
});

// Tracks the Supabase session app-wide so the navbar (and anything else)
// can react the moment SignInModal's setSession() call lands, without each
// consumer polling or re-fetching on its own. Mounted once in app/layout.tsx.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // supabaseClient() throws synchronously if NEXT_PUBLIC_SUPABASE_URL /
    // NEXT_PUBLIC_SUPABASE_ANON_KEY are missing from the build -- this
    // provider is mounted app-wide in app/layout.tsx, so an uncaught throw
    // here takes down every page, not just auth-gated ones (confirmed live
    // 2026-08-16: a CI build missing those vars did exactly that). Most of
    // this site works fine signed out, so a broken/missing auth config
    // should degrade to "no session," never crash the app.
    let client: ReturnType<typeof supabaseClient>;
    try {
      client = supabaseClient();
    } catch (error) {
      console.error('SessionProvider: Supabase client unavailable, staying signed out', error);
      setIsLoading(false);
      return;
    }

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider value={{ session, user: session?.user ?? null, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
