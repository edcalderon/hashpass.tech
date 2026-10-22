import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { apiClient } from '../lib/api-client';
import { activityRoute } from '../lib/marketing';

export default function MarketingActivityObserver() {
  const pathname = usePathname();
  const { user, isLoggedIn } = useAuth();
  useEffect(() => {
    if (!user?.id || !isLoggedIn || !activityRoute(pathname)) return;
    const timer = setTimeout(() => {
      // Only the allowlisted path is submitted, without query parameters or PII.
      // Observations never become verified points through this client endpoint.
      void apiClient.post('marketing/activity', { path: pathname.split('?')[0] }, { skipEventSegment: true, retries: 0 }).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [pathname, user?.id, isLoggedIn]);
  return null;
}
