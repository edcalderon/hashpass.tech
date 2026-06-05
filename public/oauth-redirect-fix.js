/**
 * Automatic OAuth redirect fix script
 * This script runs automatically when Supabase incorrectly redirects to auth.hashpass.co/bsl2025.hashpass.tech
 * It intercepts the redirect and fixes it before the page fully loads
 */

(function() {
  'use strict';
  
  // Only run on auth.hashpass.co domain
  if (typeof window === 'undefined' || window.location.host !== 'auth.hashpass.co') {
    return;
  }
  
  const currentPath = window.location.pathname;
  const currentUrl = window.location.href;
  
  // Check if we're on the incorrect redirect path
  if (currentPath.includes('hashpass.tech') || currentPath.startsWith('/bsl2025')) {
    console.log('🔧 [Auto-fix] Detected incorrect Supabase redirect');
    console.log('📍 Current URL:', currentUrl.substring(0, 200));
    
    // Check if we have auth tokens in the hash
    const hashFragment = window.location.hash;
    if (!hashFragment || !hashFragment.includes('access_token')) {
      console.error('❌ [Auto-fix] No access_token found in hash');
      return;
    }
    
    console.log('✅ [Auto-fix] Found access_token in hash, fixing redirect...');
    
    // Get stored origin or use default
    let correctOrigin = 'http://localhost:8081';
    try {
      const storedOrigin = localStorage.getItem('oauth_redirect_origin');
      if (storedOrigin) {
        correctOrigin = storedOrigin;
        console.log('📍 [Auto-fix] Using stored origin:', correctOrigin);
      } else {
        console.log('📍 [Auto-fix] Using default origin:', correctOrigin);
      }
    } catch {
      console.warn('⚠️ [Auto-fix] Could not access localStorage');
    }
    
    // Build redirect URL
    let redirectUrl = `${correctOrigin}/auth/callback`;
    
    // Preserve hash fragment
    redirectUrl += hashFragment;
    
    // Preserve query params
    try {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.forEach((value, key) => {
        if (key !== 'apikey') {
          const separator = redirectUrl.includes('?') ? '&' : '?';
          redirectUrl += `${separator}${key}=${encodeURIComponent(value)}`;
        }
      });
    } catch {
      // Ignore
    }
    
    console.log('🚀 [Auto-fix] Redirecting to:', redirectUrl.substring(0, 300));
    
    // Redirect immediately
    window.location.replace(redirectUrl);
  }
})();








