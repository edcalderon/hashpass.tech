import { useEffect, useState, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { memoryManager } from '../lib/memory-manager';
import { throttle } from '../lib/performance-utils';

export const useAuth = () => {
  const [user, setUser] = useState<Session['user'] | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const subscriptionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Get initial session - trust Supabase's session (like the working version)
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoggedIn(!!session?.user);
      setIsLoading(false);
    });

    // Throttle auth state changes to prevent rapid updates (reduced from 500ms to 100ms for faster response)
    // Simple approach - trust Supabase's session (like the working version)
    const throttledAuthChange = throttle((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
      setIsLoggedIn(!!session?.user);
      setIsLoading(false);
    }, 100); // Throttle to max once per 100ms for faster auth updates

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      throttledAuthChange(event, session);
    });

    // Register with memory manager for cleanup
    const subscriptionId = `auth-${Date.now()}`;
    subscriptionIdRef.current = subscriptionId;
    memoryManager.registerSubscription(subscriptionId, () => {
      subscription.unsubscribe();
    });

    return () => {
      if (subscriptionIdRef.current) {
        memoryManager.unregisterSubscription(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
      }
      subscription.unsubscribe();
      isInitializedRef.current = false;
    };
  }, []);

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  return {
    user,
    isLoggedIn,
    isLoading,
    signOut,
  };
};
