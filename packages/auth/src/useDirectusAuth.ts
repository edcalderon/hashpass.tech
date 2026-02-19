import { useEffect, useState, useRef } from 'react';
import { directusAuth, DirectusSession, DirectusUser } from './directus-auth';

export const useDirectusAuth = () => {
  const [user, setUser] = useState<DirectusUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const isInitializedRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Prevent duplicate initialization
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    // Subscribe to auth state changes
    unsubscribeRef.current = directusAuth.onAuthStateChange((session: DirectusSession | null) => {
      setUser(session?.user ?? null);
      setIsLoggedIn(!!session?.user && directusAuth.isAuthenticated());
      setIsLoading(false);
    });

    // Cleanup subscription on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await directusAuth.signIn(email, password);
      // State will be updated by the auth state change listener
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await directusAuth.signOut();
      // State will be updated by the auth state change listener
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
  };

  const refreshSession = async () => {
    try {
      await directusAuth.refreshSession();
      // State will be updated by the auth state change listener
    } catch (error) {
      throw error;
    }
  };

  const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
    return directusAuth.makeAuthenticatedRequest(url, options);
  };

  return {
    user,
    isLoggedIn,
    isLoading,
    signIn,
    signOut,
    refreshSession,
    makeAuthenticatedRequest,
    session: directusAuth.getSession(),
  };
};

// For backward compatibility, also export as useAuth
export const useAuth = useDirectusAuth;
export default useDirectusAuth;