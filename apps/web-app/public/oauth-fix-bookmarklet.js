/**
 * OAuth Redirect Fix Bookmarklet
 * 
 * If you're stuck on auth.hashpass.co/{subdomain}.hashpass.tech, run this script in the console:
 * 
 * Copy and paste this entire script into your browser console and press Enter:
 */

(function() {
  'use strict';
  
  const currentHost = window.location.host;
  const currentPath = window.location.pathname;
  const hashFragment = window.location.hash;
  
  // Check if we're on the incorrect redirect
  if (currentHost !== 'auth.hashpass.co') {
    console.log('ℹ️ Not on auth.hashpass.co, nothing to fix');
    return;
  }
  
  if (!currentPath.includes('hashpass.tech') && !currentPath.match(/\/[a-z0-9-]+\.hashpass\.tech/i)) {
    console.log('ℹ️ Path does not contain hashpass.tech subdomain');
    return;
  }
  
  if (!hashFragment || !hashFragment.includes('access_token')) {
    console.error('❌ No access_token found in hash fragment');
    return;
  }
  
  console.log('🔧 Fixing OAuth redirect...');
  
  // Extract subdomain from path
  let correctOrigin = '';
  const domainMatch = currentPath.match(/([a-z0-9-]+\.hashpass\.tech)/i);
  if (domainMatch) {
    correctOrigin = 'https://' + domainMatch[1];
    console.log('📍 Extracted origin from path:', correctOrigin);
  } else {
    // Try localStorage
    try {
      const stored = localStorage.getItem('oauth_redirect_origin');
      if (stored) {
        correctOrigin = stored;
        console.log('📍 Using stored origin:', correctOrigin);
      }
    } catch (e) {
      console.warn('⚠️ Could not access localStorage');
    }
  }
  
  if (!correctOrigin) {
    console.error('❌ Could not determine correct origin');
    console.log('💡 Try manually setting: const correctOrigin = "https://bsl2025.hashpass.tech";');
    return;
  }
  
  // Build redirect URL
  let redirectUrl = correctOrigin + '/auth/callback';
  
  // Try to get apikey
  const apikey = window.__SUPABASE_ANON_KEY__ || 
                 window.__EXPO_PUBLIC_SUPABASE_KEY__ || '';
  if (apikey) {
    redirectUrl += '?apikey=' + encodeURIComponent(apikey);
  }
  
  // Preserve hash and query params
  redirectUrl += hashFragment;
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.forEach(function(value, key) {
    if (key !== 'apikey') {
      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 
                    encodeURIComponent(key) + '=' + encodeURIComponent(value);
    }
  });
  
  console.log('🚀 Redirecting to:', redirectUrl.substring(0, 300));
  window.location.replace(redirectUrl);
})();


