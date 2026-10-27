import { useCallback, useEffect, useState } from 'react';
import { getCompanionAuthCallbackUrl, getCompanionAuthClient } from './client';
import { describeAuthError, mapAuthSession } from './model';
import type { CompanionAuthState } from './types';

const initialState: CompanionAuthState = { status: 'loading' };

export function useCompanionAuth() {
  const [state, setState] = useState<CompanionAuthState>(initialState);

  const refresh = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await getCompanionAuthClient().getSession();
      if (result.error) throw new Error(result.error.message || 'Session lookup failed.');
      const user = mapAuthSession(result.data);
      setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
    } catch (error) {
      setState({ status: 'error', error: describeAuthError(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const callbackURL = getCompanionAuthCallbackUrl();
      const result = await getCompanionAuthClient().signIn.social({
        provider: 'google',
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL: callbackURL,
        disableRedirect: true,
      });
      if (result.error) throw new Error(result.error.message || 'Sign-in failed.');

      const target = (result.data as { url?: unknown } | null)?.url;
      if (typeof target === 'string' && target) {
        window.location.assign(target);
        return;
      }
      await refresh();
    } catch (error) {
      setState({ status: 'error', error: describeAuthError(error) });
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const result = await getCompanionAuthClient().signOut();
      if (result.error) throw new Error(result.error.message || 'Sign-out failed.');
      setState({ status: 'signed-out' });
    } catch (error) {
      setState({ status: 'error', error: describeAuthError(error) });
    }
  }, []);

  return { ...state, refresh, signIn, signOut };
}
