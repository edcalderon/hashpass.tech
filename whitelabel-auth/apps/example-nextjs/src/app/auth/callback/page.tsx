'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Handle OAuth callback
    const access_token = searchParams.get('access_token');
    const refresh_token = searchParams.get('refresh_token');
    const error = searchParams.get('error');

    if (error) {
      console.error('OAuth error:', error);
      router.push('/?error=' + encodeURIComponent(error));
      return;
    }

    if (access_token) {
      // Store tokens and redirect
      // The AuthProvider will handle the session
      router.push('/');
    }
  }, [searchParams, router]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Processing authentication...</h1>
      <p>Please wait while we complete the sign-in process.</p>
    </div>
  );
}
