'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseClient } from '../../lib/supabase-client';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  profileAvatarUrl: string | null;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  isLoading: true,
  profileAvatarUrl: null,
});

async function restoreSession(client: ReturnType<typeof supabaseClient>): Promise<Session | null> {
  let lastError: unknown;

  // A second tab or a Strict Mode effect replay can briefly hold Supabase's
  // browser lock. Retry once after it has had a chance to release the lock.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }

  throw lastError;
}

// Tracks the Supabase session app-wide so the navbar (and anything else)
// can react the moment SignInModal's setSession() call lands, without each
// consumer polling or re-fetching on its own. Mounted once in app/layout.tsx.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);

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

    void restoreSession(client)
      .then((nextSession) => {
        if (!active) return;
        setSession(nextSession);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Keep public pages usable when auth storage is temporarily locked or
        // unavailable. The auth-state listener can still provide a session.
        console.warn('SessionProvider: could not restore the current session', error);
        setSession(null);
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

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfileAvatarUrl(null);
      return;
    }

    let active = true;
    setProfileAvatarUrl(null);
    void (async () => {
      try {
        const { data } = await supabaseClient()
          .from('user_profiles')
          .select('avatar_url')
          .eq('user_id', userId)
          .maybeSingle();
        if (!active) return;
        setProfileAvatarUrl(typeof data?.avatar_url === 'string' ? data.avatar_url : null);
      } catch {
        if (active) setProfileAvatarUrl(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [session?.user.id]);

  return (
    <SessionContext.Provider value={{ session, user: session?.user ?? null, isLoading, profileAvatarUrl }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
