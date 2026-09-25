import { AppState, Platform } from 'react-native';

/** Caller disposes on logout/account change/unmount. Never persist an unlock. */
export function bindWalletLifecycle(wallet: { lock(): void }): () => void {
  const subscription = AppState.addEventListener('change', state => {
    if (state !== 'active') wallet.lock();
  });
  const onVisibility = () => { if (document.visibilityState !== 'visible') wallet.lock(); };
  const onPageHide = () => wallet.lock();
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
  }
  return () => {
    subscription.remove();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    }
    wallet.lock();
  };
}
